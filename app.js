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
    calib.timer = setTimeout(() =>
