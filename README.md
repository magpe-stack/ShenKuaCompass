# Manual Completo do Utilizador — Shen Kua Compass

## Capítulo 1: Visão Geral e Fundamentos do Shen Kua Compass
O **Shen Kua Compass** é uma Aplicação Web Progressiva (PWA) de altíssima precisão desenvolvida sob a filosofia *Mobile-First*. O sistema foi projetado especificamente para tirar o máximo partido do hardware de sensores modernos em dispositivos móveis, com foco de validação e calibração fina no Google Chrome para Android (exemplificado pelo Samsung Galaxy A52).

A aplicação opera inteiramente no lado do cliente (sem dependências de servidores externos para o cálculo ou processamento de orientação), garantindo total privacidade de dados, suporte a funcionamento 100% offline via *Service Worker* e persistência segura utilizando o armazenamento local do navegador (`localStorage`).


![Capa Shenkua](shenkuacover.png)



---

## Capítulo 2: Homenagem Histórica a Shen Kua (1031–1095)
O nome da aplicação presta tributo direto ao polímata chinês **Shen Kua** (沈括), figura central da ciência durante a Dinastia Song. Na sua obra capital, *Mengxi Bitan* (*Ensaios do Pool de Sonhos*), Shen Kua revolucionou a história da navegação e da física através de duas contribuições imperdíveis:
1. **A Suspensão por Fio de Seda:** Foi o pioneiro a suspender uma agulha magnetizada por um fio único de seda (fixada com cera), eliminando o atrito mecânico de superfícies estáticas ou pivôs rudimentares, permitindo que a agulha oscilasse livremente para encontrar o norte.
2. **A Declinação Magnética:** Identificou pela primeira vez na história que a agulha magnetizada não apontava estritamente para o polo geográfico verdadeiro, mas apresentava uma divergência angular constante.

Inspirado por este rigor, o **Shen Kua Compass** utiliza os sensores espaciais modernos para aplicar correções e compensações trigonométricas avançadas em tempo real.

---

## Chapter 3: Arquitetura Técnica e Sensores Nativos
O software dispensa frameworks complexas, sendo construído em HTML5 semântico, CSS3 modular e JavaScript puro (ES6+). Os pilares tecnológicos incluem:
* **DeviceOrientationEvent & absolute:** Extração das rotações espaciais tridimensionais (*alpha*, *beta*, *gamma*).
* **DeviceMotionEvent:** Monitorização contínua de aceleração linear e velocidade angular para aferir ruído, vibração e estabilidade do aparelho.
* **Magnetometer API:** Leitura direta do vetor do campo magnético terrestre em microteslas ($\mu\text{T}$) para auditoria de interferências ferromagnéticas.
* **Paleta de Cores Monocromática Oficial:** Conformidade visual estrita com os códigos de design definidos: Branco Puro (`#FFFFFF`), Vermelho de Ênfase (`#FF0000`), Bege Areia (`#DDC592`) e Cinzas Técnicos (`#D9D9D9` / `#F2F2F2`).

---

## Capítulo 4: Guia de Instalação e Execução PWA
Como uma PWA moderna, o aplicativo pode ser instalado diretamente no sistema operativo do telemóvel:
1. Abra o endereço de publicação da aplicação no Google Chrome no seu dispositivo móvel.
2. O botão **"Instalar"** aparecerá na barra de ferramentas superior caso o manifesto seja detetado pelo navegador.
3. Em alternativa, abra o menu de opções do Chrome (três pontos) e selecione **"Adicionar à tela inicial"** ou **"Instalar aplicativo"**.
4. Uma vez instalado, o *Shen Kua Compass* comportar-se-á como um aplicativo nativo, rodando em modo ecrã inteiro (*standalone*) e mantendo todas as funções operacionais mesmo sem ligação à internet.

---

## Capítulo 5: Operação de Sensores e Permissões de Segurança
Para iniciar as medições:
1. Toque no botão principal **"Ativar sensores"**.
2. Conceda a permissão de acesso aos sensores de movimento e orientação solicitada pelo navegador.
3. O mostrador circular da bússola começará a responder instantaneamente aos movimentos do aparelho.
4. **Nota sobre o Wake Lock:** A aplicação solicita automaticamente o bloqueio de suspensão do ecrã (`Screen Wake Lock API`), garantindo que o visor permaneça ligado e ativo durante medições prolongadas em campo.

---

## Capítulo 6: Calibração Avançada e O Gesto do "8"
Para mitigar pequenos desvios magnéticos inerentes ao sensor do telemóvel:
1. Toque no botão **"Calibrar"** para abrir o assistente gráfico interativo.
2. Segure o telemóvel firmemente e movimente-o no ar desenhando o símbolo do infinito (**o número "8" deitado**), rotacionando simultaneamente o pulso em diferentes eixos espaciais.
3. A barra de progresso em tempo real indicará a recolha de amostras de 360 graus.
4. Ao atingir 100%, a calibração é armazenada localmente, garantindo máxima confiabilidade para o azimute calculado.

---

## Capítulo 7: Compensação de Inclinação (*Tilt-Compensation*) e Leituras de Pitch e Roll
Bússolas digitais convencionais perdem precisão se o aparelho estiver inclinado. O *Shen Kua Compass* resolve isto através de um algoritmo de matriz de rotação geométrica:
* **Pitch (Inclinação Frontal/Traseira):** Exibido em graus, mede o ângulo de inclinação vertical no eixo longitudinal.
* **Roll (Inclinação Lateral):** Mede o balanço transversal do aparelho.
* **Nível de Bolha Digital:** Uma representação visual interativa na interface acompanha os ângulos em tempo real. Graças à compensação matemática, o azimute magnético permanece rigorosamente correto mesmo que o telemóvel não esteja perfeitamente plano.

---

## Capítulo 8: Gestão de Declinação Magnética
Para converter o Norte Magnético em Norte Geográfico (Verdadeiro):
1. Insira o valor da declinação da sua região no campo dedicado na interface.
2. Utilize o botão de alternância de sinal (**±**) para definir valores positivos (leste) ou negativos (oeste).
3. O mostrador aplicará a rotação corretiva instantaneamente em todas as leituras subsequentes e relatórios gerados.

---

## Capítulo 9: Gestão de Dados, Relatórios e Menu Arquivo
O menu **Arquivo** centraliza todas as ferramentas profissionais de exportação de dados de campo:
* **Registrar Leitura:** Grava instantaneamente um snapshot contendo azimute verdadeiro, declinação, pitch, roll, estabilidade, carimbo temporal e coordenadas de geolocalização.
* **Exportação JSON:** Descarrega um objeto de dados estruturado para cópias de segurança.
* **Exportação Markdown (.md):** Produz relatórios formatados em tabela para publicação em plataformas de notas e documentação (Obsidian, GitHub, Notion).
* **Exportação Word (.docx):** Gera um documento real compatível com o Microsoft Word contendo tabelas formatadas sem dependências externas.
* **Importação e Impressão:** Permite carregar ficheiros JSON anteriores ou enviar relatórios diretamente para impressoras e exportação PDF via folha de estilos dedicada.

---

## Capítulo 10: Resolução de Problemas e Boas Práticas de Campo
* **Interferência Magnética:** Caso o indicador de campo detecte valores anómalos fora da faixa normal (20–70 $\mu\text{T}$), afaste o aparelho de capas com fechos magnéticos, colunas de som, armações de ferro ou veículos.
* **Modo Relativo vs Absoluto:** Certifique-se de usar o Google Chrome atualizado. Caso o sensor inicie em modo relativo (sem referência geométrica absoluta ao polo), refaça o movimento de calibração em "8" ao ar livre para redefinir o magnetómetro.
