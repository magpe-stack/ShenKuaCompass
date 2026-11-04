(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const D2R = Math.PI / 180;
  const R2D = 180 / Math.PI;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const KEYS = {
    readings: 'shenkua.readings',
    theme: 'shenkua.theme',
    decl: 'shenkua.declination',
    calib: 'shenkua.calibratedAt'
  };
  const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'L', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];

  const state = {
    active: false,
    absolute: false,
    gotEvent: false,
    sx: 0, sy: 0, init: false,
    pitch: 0, roll: 0,
    samples: [],
    motion: 0,
    spin: 0,
    readings: [],
    declination: 0,
    calibratedAt: null,
    wakeLock: null,
    orientationHandler: null
  };

  const el = {
    dial: $('#dial'), ticks: $('#ticks'),
    value: $('#hdg-value'), card: $('#hdg-card'), label: $('#hdg-label'),
    pitch: $('#pitch'), roll: $('#roll'), bubble: $('#bubble'),
    stabBar: $('#stab-bar'), stabMeter: $('#stab-meter'), stabText: $('#stab-text'),
    accText: $('#acc-text'), calibText: $('#calib-text'),
    warning: $('#signal-warning'),
    btnStart: $('#btn-start'), btnCalib: $('#btn-calib'), btnRecord: $('#btn-record'),
    decl: $('#decl-input'),
    histBody: $('#history-body'), histTable: $('#history-table'), histEmpty: $('#history-empty'), count: $('#count'),
    toast: $('#toast'), fileInput: $('#file-input'), print: $('#print-report'),
    helpDialog: $('#help-dialog'), calibDialog: $('#calib-dialog'),
    calibProgress: $('#calib-progress'), calibStatus: $('#calib-status'),
    fileBtn: $('#btn-file'), fileMenu: $('#file-menu'),
    install: $('#btn-install')
  };

  /* ---------- Armazenamento seguro ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* indisponível */ } }
  };

  /* ---------- Utilidades ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad3 = (n) => String(Math.round(n) % 360).padStart(3, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmtLoc = (l) => (l ? `${l.lat}, ${l.lon}` : '—');
  const fmtDate = (iso) => new Date(iso).toLocaleString('pt-BR');

  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3200);
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ---------- Tema ---------- */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#1A1A1A' : '#DDC592');
    store.set(KEYS.theme, theme);
  }
  function initTheme() {
    const saved = store.get(KEYS.theme);
    const prefersDark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));
    $('#btn-theme').addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------- Mostrador ---------- */
  function buildDial() {
    for (let a = 0; a < 360; a += 5) {
      const major = a % 30 === 0;
      const line = document.createElementNS(SVGNS, 'line');
      line.setAttribute('x1', 0); line.setAttribute('x2', 0);
      line.setAttribute('y1', -130); line.setAttribute('y2', major ? -116 : -123);
      line.setAttribute('class', major ? 'tick major' : 'tick');
      line.setAttribute('transform', `rotate(${a})`);
      el.ticks.appendChild(line);
    }
    const labels = { 0: 'N', 90: 'L', 180: 'S', 270: 'O' };
    for (let a = 0; a < 360; a += 30) {
      const t = document.createElementNS(SVGNS, 'text');
      const isCard = a in labels;
      t.textContent = isCard ? labels[a] : String(a);
      t.setAttribute('class', a === 0 ? 'card-n' : isCard ? 'card-m' : 'deg');
      t.setAttribute('transform', `rotate(${a}) translate(0,${isCard ? -102 : -105})`);
      el.ticks.appendChild(t);
    }
  }

  /* ---------- Matemática de orientação ---------- */
  // Azimute com compensação de inclinação, a partir de alpha/beta/gamma (rotação Z-X'-Y'').
  // Combina o vetor do topo do aparelho (aparelho plano) com o vetor da traseira
  // (aparelho em pé), para continuidade em qualquer inclinação.
  function headingFrom(alpha, beta, gamma) {
    const a = alpha * D2R, b = beta * D2R, g = gamma * D2R;
    const ca = Math.cos(a), sa = Math.sin(a);
    const cb = Math.cos(b), sb = Math.sin(b);
    const cg = Math.cos(g), sg = Math.sin(g);

    let tx = -sa * cb;
    let ty = ca * cb;
    if (cb < 0) { tx = -tx; ty = -ty; }

    const bx = -ca * sg - sa * sb * cg;
    const by = -sa * sg + ca * sb * cg;

    const h = Math.atan2(tx + bx, ty + by) * R2D;
    return (h + 360) % 360;
  }

  function circularSD(list) {
    if (list.length < 8) return 99;
    let c = 0, s = 0;
    for (const a of list) { c += Math.cos(a * D2R); s += Math.sin(a * D2R); }
    const R = Math.hypot(c, s) / list.length;
    return Math.sqrt(-2 * Math.log(Math.max(R, 1e-9))) * R2D;
  }

  /* ---------- Sensores ---------- */
  function onOrientation(e) {
    if (e.alpha == null && e.webkitCompassHeading == null) return;
    state.gotEvent = true;

    const hasIOS = typeof e.webkitCompassHeading === 'number';
    state.absolute = hasIOS || e.absolute === true || e.type === 'deviceorientationabsolute';

    const beta = e.beta || 0;
    const gamma = e.gamma || 0;
    const raw = hasIOS ? e.webkitCompassHeading : headingFrom(e.alpha || 0, beta, gamma);

    state.pitch = beta;
    state.roll = gamma;

    if (!state.init) {
      state.sx = Math.cos(raw * D2R);
      state.sy = Math.sin(raw * D2R);
      state.init = true;
    } else {
      const k = 0.18;
      state.sx += k * (Math.cos(raw * D2R) - state.sx);
      state.sy += k * (Math.sin(raw * D2R) - state.sy);
    }

    state.samples.push(raw);
    if (state.samples.length > 45) state.samples.shift();

    if (calib.running) trackCalibration(e);
  }

  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (a && a.x != null) {
      const dev = Math.abs(Math.hypot(a.x, a.y, a.z) - 9.81);
      state.motion += 0.2 * (dev - state.motion);
    }
    const r = e.rotationRate;
    if (r && r.alpha != null) {
      state.spin += 0.2 * (Math.hypot(r.alpha, r.beta, r.gamma) - state.spin);
    }
  }

  async function requestPermissions() {
    const asks = [];
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      asks.push(DeviceOrientationEvent.requestPermission());
    }
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      asks.push(DeviceMotionEvent.requestPermission());
    }
    if (!asks.length) return true;
    const results = await Promise.all(asks);
    return results.every((r) => r === 'granted');
  }

  function attachOrientation(type) {
    if (state.orientationHandler) {
      window.removeEventListener(state.orientationHandler.type, onOrientation, true);
    }
    state.orientationHandler = { type };
    window.addEventListener(type, onOrientation, true);
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        state.wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (_) { /* opcional */ }
  }

  async function startSensors() {
    if (!('DeviceOrientationEvent' in window)) {
      toast('Este navegador não oferece sensores de orientação.');
      return;
    }
    el.btnStart.disabled = true;
    let granted = false;
    try { granted = await requestPermissions(); } catch (_) { granted = false; }
    if (!granted) {
      el.btnStart.disabled = false;
      toast('Permissão negada. Libere “Sensores de movimento” nas configurações do site.');
      return;
    }

    state.gotEvent = false;
    const preferAbsolute = 'ondeviceorientationabsolute' in window;
    attachOrientation(preferAbsolute ? 'deviceorientationabsolute' : 'deviceorientation');
    window.addEventListener('devicemotion', onMotion, true);

    setTimeout(() => {
      if (!state.gotEvent && preferAbsolute) attachOrientation('deviceorientation');
      setTimeout(() => {
        if (!state.gotEvent) {
          toast('Nenhum dado de sensor recebido. Verifique permissões e HTTPS.');
          el.btnStart.disabled = false;
          el.btnStart.textContent = 'Tentar novamente';
        }
      }, 1500);
    }, 1500);

    state.active = true;
    requestWakeLock();
    el.btnStart.textContent = 'Sensores ativos';
    el.btnCalib.disabled = false;
    el.btnRecord.disabled = false;
    el.label.textContent = 'Norte magnético · mantenha o aparelho afastado de metais';
  }

  /* ---------- Calibração ---------- */
  const calib = { running: false, bins: new Set(), total: 14, t0: 0, timer: null };

  function trackCalibration(e) {
    const alpha = ((e.alpha || 0) % 360 + 360) % 360;
    const b = e.beta || 0, g = e.gamma || 0;
    calib.bins.add('a' + Math.floor(alpha / 45));
    calib.bins.add(b < -20 ? 'b-' : b > 20 ? 'b+' : 'b0');
    calib.bins.add(g < -20 ? 'g-' : g > 20 ? 'g+' : 'g0');
    const pct = Math.round((calib.bins.size / calib.total) * 100);
    el.calibProgress.value = pct;
    el.calibStatus.textContent = pct < 40 ? 'Continue o movimento em 8…' : pct < 80 ? 'Quase lá…' : 'Concluindo…';
    if (calib.bins.size >= Math.ceil(calib.total * 0.8)) finishCalibration(true);
  }

  function startCalibration() {
    calib.running = true;
    calib.bins.clear();
    calib.t0 = performance.now();
    el.calibProgress.value = 0;
    el.calibStatus.textContent = 'Aguardando movimento…';
    if (!el.calibDialog.open) el.calibDialog.showModal();
    clearTimeout(calib.timer);
    calib.timer = setTimeout(() => finishCalibration(false), 25000);
  }

  function finishCalibration(ok) {
    if (!calib.running) return;
    calib.running = false;
    clearTimeout(calib.timer);
    if (el.calibDialog.open) el.calibDialog.close();
    if (ok) {
      state.calibratedAt = Date.now();
      store.set(KEYS.calib, String(state.calibratedAt));
      state.samples.length = 0;
      state.init = false;
      toast('Calibração concluída.');
    } else {
      toast('Calibração incompleta. Tente girar o aparelho em mais direções.');
    }
    updateCalibText();
  }

  function updateCalibText() {
    if (!state.calibratedAt) { el.calibText.textContent = 'Nunca'; return; }
    const mins = Math.round((Date.now() - state.calibratedAt) / 60000);
    el.calibText.textContent = mins < 1 ? 'Agora' : mins < 60 ? `${mins} min atrás` : mins < 1440 ? `${Math.round(mins / 60)} h atrás` : `${Math.round(mins / 1440)} d atrás`;
  }

  /* ---------- Qualidade do sinal ---------- */
  function computeQuality() {
    const sd = circularSD(state.samples);
    const score = clamp(100 * Math.exp(-sd / 4) * Math.exp(-state.motion / 4) * Math.exp(-state.spin / 150), 0, 100);
    const stabLabel = score >= 85 ? 'Excelente' : score >= 65 ? 'Boa' : score >= 40 ? 'Moderada' : 'Instável';

    const steep = Math.abs(state.pitch) > 70 || Math.abs(state.roll) > 70;
    const calibFresh = state.calibratedAt && Date.now() - state.calibratedAt < 7 * 86400000;

    let points = 0;
    if (state.absolute) points += 2;
    if (calibFresh) points += 1;
    if (score >= 65) points += 1;
    if (!steep) points += 1;
    const acc = !state.absolute ? 'Baixa' : points >= 5 ? 'Alta' : points >= 3 ? 'Média' : 'Baixa';

    let warning = '';
    if (!state.absolute) warning = 'Sensor relativo: o azimute não está referenciado ao norte magnético. Use o Chrome atualizado e calibre.';
    else if (steep) warning = 'Inclinação extrema: a precisão do azimute diminui. Aproxime o aparelho da horizontal.';
    else if (!calibFresh) warning = 'Calibre o sensor desenhando um 8 no ar para melhor precisão.';

    return { score, stabLabel, acc, warning };
  }

  /* ---------- Renderização ---------- */
  let lastText = 0;
  function frame(now) {
    if (state.init) {
      const mag = (Math.atan2(state.sy, state.sx) * R2D + 360) % 360;
      const shown = (mag + state.declination + 360) % 360;
      el.dial.style.transform = `rotate(${-shown}deg)`;

      const bx = clamp(-state.roll, -45, 45) / 45 * 20;
      const by = clamp(-state.pitch, -45, 45) / 45 * 20;
      el.bubble.style.transform = `translate(${bx}px, ${by}px)`;

      if (now - lastText > 100) {
        lastText = now;
        el.value.textContent = pad3(shown) + '°';
        el.card.textContent = CARDINALS[Math.round(shown / 22.5) % 16];
        el.pitch.textContent = state.pitch.toFixed(1) + '°';
        el.roll.textContent = state.roll.toFixed(1) + '°';
        el.bubble.classList.toggle('flat', Math.abs(state.pitch) < 2 && Math.abs(state.roll) < 2);

        const q = computeQuality();
        el.stabBar.style.width = q.score.toFixed(0) + '%';
        el.stabMeter.setAttribute('aria-valuenow', q.score.toFixed(0));
        el.stabMeter.classList.toggle('low', q.score < 40);
        el.stabText.textContent = `${q.stabLabel} (${q.score.toFixed(0)}%)`;
        el.accText.textContent = q.acc + (state.absolute ? '' : ' (relativo)');
        el.warning.hidden = !q.warning;
        el.warning.textContent = q.warning;
        el.label.textContent = state.declination
          ? `Norte verdadeiro · declinação ${state.declination > 0 ? '+' : ''}${state.declination}°`
          : 'Norte magnético';
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Leituras ---------- */
  function getPosition() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 }
      );
    });
  }

  async function recordReading() {
    if (!state.init) { toast('Aguardando dados dos sensores…'); return; }
    el.btnRecord.disabled = true;
    const mag = (Math.atan2(state.sy, state.sx) * R2D + 360) % 360;
    const q = computeQuality();
    const location = await getPosition();
    state.readings.push({
      id: uid(),
      timestamp: new Date().toISOString(),
      azimuth: +mag.toFixed(1),
      declination: state.declination,
      trueAzimuth: +((mag + state.declination + 360) % 360).toFixed(1),
      pitch: +state.pitch.toFixed(1),
      roll: +state.roll.toFixed(1),
      stability: Math.round(q.score),
      accuracy: q.acc,
      location
    });
    saveReadings();
    renderHistory();
    el.btnRecord.disabled = false;
    toast('Leitura registrada.');
  }

  function saveReadings() { store.set(KEYS.readings, JSON.stringify(state.readings)); }

  function normalizeReading(r) {
    if (!r || typeof r !== 'object') return null;
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
    const azimuth = num(r.azimuth);
    if (Number.isNaN(azimuth)) return null;
    const ts = new Date(r.timestamp);
    const loc = r.location && Number.isFinite(Number(r.location.lat)) && Number.isFinite(Number(r.location.lon))
      ? { lat: Number(r.location.lat), lon: Number(r.location.lon), acc: Number(r.location.acc) || 0 }
      : null;
    const decl = Number.isFinite(num(r.declination)) ? num(r.declination) : 0;
    return {
      id: String(r.id || uid()).slice(0, 40),
      timestamp: isNaN(ts) ? new Date().toISOString() : ts.toISOString(),
      azimuth,
      declination: decl,
      trueAzimuth: Number.isFinite(num(r.trueAzimuth)) ? num(r.trueAzimuth) : azimuth,
      pitch: Number.isFinite(num(r.pitch)) ? num(r.pitch) : 0,
      roll: Number.isFinite(num(r.roll)) ? num(r.roll) : 0,
      stability: Number.isFinite(num(r.stability)) ? num(r.stability) : 0,
      accuracy: String(r.accuracy || '').slice(0, 20),
      location: loc
    };
  }

  function loadReadings() {
    try {
      const raw = JSON.parse(store.get(KEYS.readings) || '[]');
      state.readings = Array.isArray(raw) ? raw.map(normalizeReading).filter(Boolean) : [];
    } catch (_) { state.readings = []; }
  }

  function renderHistory() {
    el.histBody.textContent = '';
    const list = state.readings.slice().reverse();
    list.forEach((r, i) => {
      const tr = document.createElement('tr');
      const cells = [
        state.readings.length - i,
        new Date(r.timestamp).toLocaleTimeString('pt-BR'),
        `${r.trueAzimuth.toFixed(1)}°`,
        `${r.pitch.toFixed(1)}°`,
        `${r.roll.toFixed(1)}°`,
        fmtLoc(r.location)
      ];
      cells.forEach((c) => {
        const td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      });
      el.histBody.appendChild(tr);
    });
    el.count.textContent = String(state.readings.length);
    el.histTable.hidden = !state.readings.length;
    el.histEmpty.hidden = !!state.readings.length;
  }

  /* ---------- Arquivo: exportações ---------- */
  function requireData() {
    if (!state.readings.length) { toast('Não há leituras para exportar.'); return false; }
    return true;
  }

  function exportJSON() {
    if (!requireData()) return;
    const payload = {
      app: 'Shen Kua Compass',
      version: 1,
      exportedAt: new Date().toISOString(),
      readings: state.readings
    };
    download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `shen-kua-${stamp()}.json`);
  }

  function stamp() { return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); }

  function exportMD() {
    if (!requireData()) return;
    const lines = [
      '# Shen Kua Compass — Relatório de leituras',
      '',
      `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
      `Total de leituras: ${state.readings.length}`,
      '',
      '| # | Data/hora | Azimute | Decl. | Pitch | Roll | Estab. | Local |',
      '|--:|-----------|--------:|------:|------:|-----:|-------:|-------|'
    ];
    state.readings.forEach((r, i) => {
      lines.push(`| ${i + 1} | ${fmtDate(r.timestamp)} | ${r.trueAzimuth.toFixed(1)}° | ${r.declination}° | ${r.pitch.toFixed(1)}° | ${r.roll.toFixed(1)}° | ${r.stability}% | ${fmtLoc(r.location)} |`);
    });
    lines.push('', '_Azimute em relação ao Norte magnético corrigido pela declinação informada._', '');
    download(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }), `shen-kua-${stamp()}.md`);
  }

  /* DOCX mínimo, sem dependências (ZIP sem compressão) */
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function buildZip(files, mime) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    for (const f of files) {
      const name = enc.encode(f.name);
      const data = enc.encode(f.content);
      const crc = crc32(data);

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true);
      lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true);
      ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);

      offset += 30 + name.length + data.length;
    }

    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: mime });
  }

  const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

  function docxParagraph(text, bold, size) {
    return `<w:p><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`;
  }

  function docxCell(text, width, bold) {
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${docxParagraph(text, bold, 18)}</w:tc>`;
  }

  function exportDOCX() {
    if (!requireData()) return;
    const widths = [500, 1900, 1000, 800, 900, 900, 900, 2100];
    const head = ['#', 'Data/hora', 'Azimute', 'Decl.', 'Pitch', 'Roll', 'Estab.', 'Local'];
    const border = (n) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/>`;
    const rows = [`<w:tr>${head.map((h, i) => docxCell(h, widths[i], true)).join('')}</w:tr>`];
    state.readings.forEach((r, i) => {
      const vals = [i + 1, fmtDate(r.timestamp), `${r.trueAzimuth.toFixed(1)}°`, `${r.declination}°`, `${r.pitch.toFixed(1)}°`, `${r.roll.toFixed(1)}°`, `${r.stability}%`, fmtLoc(r.location)];
      rows.push(`<w:tr>${vals.map((v, k) => docxCell(v, widths[k], false)).join('')}</w:tr>`);
    });

    const body =
      docxParagraph('Shen Kua Compass — Relatório de leituras', true, 32) +
      docxParagraph(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, false, 20) +
      docxParagraph(`Total de leituras: ${state.readings.length}`, false, 20) +
      `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>` +
      docxParagraph('Azimute em relação ao Norte magnético corrigido pela declinação informada.', false, 18);

    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const files = [
      {
        name: '[Content_Types].xml',
        content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
      },
      {
        name: '_rels/.rels',
        content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
      },
      {
        name: 'word/document.xml',
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
      }
    ];
    download(buildZip(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), `shen-kua-${stamp()}.docx`);
  }

  /* ---------- Arquivo: importar, limpar, imprimir ---------- */
  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const list = Array.isArray(data) ? data : data && data.readings;
        if (!Array.isArray(list)) throw new Error('formato');
        const incoming = list.map(normalizeReading).filter(Boolean);
        if (!incoming.length) throw new Error('vazio');
        const ids = new Set(state.readings.map((r) => r.id));
        let added = 0;
        incoming.forEach((r) => { if (!ids.has(r.id)) { state.readings.push(r); added++; } });
        state.readings.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        saveReadings();
        renderHistory();
        toast(`${added} leitura(s) importada(s).`);
      } catch (_) {
        toast('Arquivo JSON inválido para o Shen Kua Compass.');
      }
    };
    reader.onerror = () => toast('Não foi possível ler o arquivo.');
    reader.readAsText(file);
  }

  function clearReadings() {
    if (!state.readings.length) { toast('Já não há leituras.'); return; }
    if (!confirm('Apagar todas as leituras registradas? Esta ação não pode ser desfeita.')) return;
    state.readings = [];
    saveReadings();
    renderHistory();
    toast('Leituras limpas.');
  }

  function printReport() {
    if (!requireData()) return;
    el.print.textContent = '';
    const h1 = document.createElement('h1');
    h1.textContent = 'Shen Kua Compass — Relatório de leituras';
    const p1 = document.createElement('p');
    p1.textContent = `Gerado em: ${new Date().toLocaleString('pt-BR')}`;
    const p2 = document.createElement('p');
    p2.textContent = `Total de leituras: ${state.readings.length}`;
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['#', 'Data/hora', 'Azimute', 'Decl.', 'Pitch', 'Roll', 'Estab.', 'Local'].forEach((t) => {
      const th = document.createElement('th'); th.textContent = t; hr.appendChild(th);
    });
    thead.appendChild(hr);
    const tbody = document.createElement('tbody');
    state.readings.forEach((r, i) => {
      const tr = document.createElement('tr');
      [i + 1, fmtDate(r.timestamp), `${r.trueAzimuth.toFixed(1)}°`, `${r.declination}°`, `${r.pitch.toFixed(1)}°`, `${r.roll.toFixed(1)}°`, `${r.stability}%`, fmtLoc(r.location)].forEach((v) => {
        const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    el.print.append(h1, p1, p2, table);
    setTimeout(() => window.print(), 50);
  }

  /* ---------- Menu Arquivo ---------- */
  function toggleMenu(open) {
    el.fileMenu.hidden = !open;
    el.fileBtn.setAttribute('aria-expanded', String(open));
  }

  function initMenu() {
    el.fileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(el.fileMenu.hidden);
    });
    document.addEventListener('click', (e) => {
      if (!el.fileMenu.hidden && !el.fileMenu.contains(e.target)) toggleMenu(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleMenu(false); });

    el.fileMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      toggleMenu(false);
      switch (btn.dataset.action) {
        case 'new': clearReadings(); break;
        case 'export-json': exportJSON(); break;
        case 'export-md': exportMD(); break;
        case 'export-docx': exportDOCX(); break;
        case 'import': el.fileInput.click(); break;
        case 'print': printReport(); break;
      }
    });

    el.fileInput.addEventListener('change', () => {
      const f = el.fileInput.files && el.fileInput.files[0];
      if (f) importJSON(f);
      el.fileInput.value = '';
    });
  }

  /* ---------- PWA ---------- */
  let deferredPrompt = null;
  function initPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      el.install.hidden = false;
    });
    el.install.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      el.install.hidden = true;
    });
    window.addEventListener('appinstalled', () => { el.install.hidden = true; toast('Aplicativo instalado.'); });
  }

  /* ---------- Declinação (aceita vírgula, ponto e sinal) ---------- */
  function parseDecl(str) {
    const n = parseFloat(String(str == null ? '' : str).replace(/[−–—]/g, '-').replace(',', '.').trim());
    return Number.isFinite(n) ? clamp(n, -90, 90) : 0;
  }

  function setDecl(v, rewrite) {
    state.declination = v;
    store.set(KEYS.decl, String(v));
    if (rewrite) el.decl.value = String(v);
  }

  /* ---------- Inicialização ---------- */
  function init() {
    initTheme();
    buildDial();
    loadReadings();
    renderHistory();
    initMenu();
    initPWA();

    state.declination = parseDecl(store.get(KEYS.decl));
    el.decl.value = String(state.declination);
    el.decl.addEventListener('input', () => setDecl(parseDecl(el.decl.value), false));
    el.decl.addEventListener('blur', () => setDecl(parseDecl(el.decl.value), true));
    $('#decl-sign').addEventListener('click', () => {
      let t = el.decl.value.trim().replace(/[−–—]/g, '-');
      t = t.startsWith('-') ? t.slice(1) : '-' + t.replace(/^\+/, '');
      el.decl.value = t || '0';
      setDecl(parseDecl(el.decl.value), false);
      el.decl.focus();
    });

    const saved = Number(store.get(KEYS.calib));
    if (saved) state.calibratedAt = saved;
    updateCalibText();
    setInterval(updateCalibText, 30000);

    el.btnStart.addEventListener('click', startSensors);
    el.btnCalib.addEventListener('click', startCalibration);
    el.btnRecord.addEventListener('click', recordReading);
    $('#btn-help').addEventListener('click', () => el.helpDialog.showModal());
    el.calibDialog.addEventListener('close', () => {
      if (calib.running) { calib.running = false; clearTimeout(calib.timer); }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.active) requestWakeLock();
    });

    requestAnimationFrame(frame);
    setTimeout(() => $('#splash').classList.add('hide'), 900);
  }

  init();
})();
