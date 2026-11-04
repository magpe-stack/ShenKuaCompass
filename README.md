# Manual do Usuário — Shen Kua Compass

## Capítulo 1: Visão Geral
O **Shen Kua Compass** é um aplicativo web progressivo (PWA) de bússola digital, desenvolvido com a filosofia *Mobile-First*. Ele foi pensado para aproveitar os sensores dos celulares modernos, com validação e ajuste fino no Google Chrome para Android (por exemplo, no Samsung Galaxy A52).

O app roda inteiramente no seu aparelho: o cálculo da orientação não depende de servidores externos. Isso garante privacidade, funcionamento 100% offline via *Service Worker* e armazenamento local dos dados (`localStorage`).

---

## Capítulo 2: Homenagem Histórica a Shen Kua (1031–1095)
O nome do aplicativo homenageia o polímata chinês **Shen Kua** (沈括), figura central da ciência na Dinastia Song. Em sua obra *Mengxi Bitan* (*Ensaios do Riacho dos Sonhos*), ele registrou duas contribuições fundamentais para a história da navegação:

1. **A agulha suspensa por fio de seda:** descreveu uma agulha magnetizada presa por um único fio de seda (fixado com cera), o que reduz o atrito e permite que ela oscile livremente até encontrar o norte.
2. **A declinação magnética:** observou que a agulha magnetizada não aponta exatamente para o norte geográfico verdadeiro, mas apresenta uma pequena diferença angular.

Inspirado nessa observação, o Shen Kua Compass permite corrigir o Norte magnético pela declinação do seu local.

![Capa Shen Kua](shenkuacover.png)

---

## Capítulo 3: Arquitetura Técnica e Sensores
O app é construído com HTML5, CSS3 e JavaScript puro (ES6+), sem frameworks. Os principais recursos utilizados são:

* **DeviceOrientationEvent (absoluto):** fornece as rotações tridimensionais (*alpha*, *beta* e *gamma*) referenciadas ao norte magnético.
* **DeviceMotionEvent:** mede aceleração e velocidade angular para avaliar vibração e estabilidade do aparelho.
* **Screen Wake Lock API:** mantém a tela ligada durante as medições.
* **Service Worker e Web App Manifest:** permitem instalação e uso offline.
* **Paleta de cores:** Branco (`#FFFFFF`), Vermelho (`#FF0000`), Bege areia (`#DDC592`) e Cinzas (`#D9D9D9` e `#F2F2F2`). O modo escuro usa ainda um neutro de fundo e texto (`#1A1A1A`).

---

## Capítulo 4: Instalação como Aplicativo (PWA)
1. Abra o endereço do app no Google Chrome do celular.
2. Se o Chrome detectar o manifesto, o botão **Instalar** aparece na barra de ferramentas.
3. Como alternativa, abra o menu do Chrome (três pontos) e escolha **Instalar app** ou **Adicionar à tela inicial**.
4. Depois de instalado, o app abre em tela cheia (*standalone*) e funciona mesmo sem internet.

> Para receber atualizações, abra o app com internet e feche-o por completo. Na abertura seguinte, a versão nova assume.

---

## Capítulo 5: Interface Principal
A primeira tela reúne tudo o que é essencial:

* **Barra de ferramentas:** menu **Arquivo**, alternador de tema claro/escuro, botão de **Ajuda** (?) e ícone do **GitHub**, que leva ao repositório do projeto.
* **Bússola:** mostrador giratório com o azimute em graus e o ponto cardeal (N, L, S, O e intermediários).
* **Botões:** **Ativar sensores**, **Calibrar** e **Registrar**.
* **Inclinação:** nível de bolha com Pitch e Roll.
* **Sinal:** barra de estabilidade, nível de precisão e tempo desde a última calibração.
* **Declinação magnética:** campo para informar a declinação, com botão **±**.
* **Leituras registradas:** tabela com o histórico salvo (fica abaixo da primeira tela).

---

## Capítulo 6: Ativando os Sensores
1. Toque em **Ativar sensores**.
2. Conceda a permissão de sensores de movimento e orientação, se o navegador solicitar.
3. A bússola passa a responder aos movimentos do aparelho.
4. O app solicita o bloqueio de suspensão da tela (*Wake Lock*), para que ela permaneça ligada durante medições longas.

> Se nada acontecer, no Chrome do Android vá em *Configurações do site → Sensores de movimento → Permitir*. O app precisa ser aberto por HTTPS.

---

## Capítulo 7: Calibração
Para reduzir desvios magnéticos do sensor:

1. Toque em **Calibrar** para abrir o assistente.
2. Segure o celular com firmeza e desenhe um **8** no ar, girando o pulso em diferentes direções.
3. A barra de progresso mostra quanto da variedade de posições já foi coberta.
4. Quando a cobertura é suficiente, a calibração é concluída e a data fica registrada no cartão **Sinal**. Se o tempo esgotar antes disso, o app avisa para tentar de novo.

Recalibre sempre que a precisão cair ou o aparelho tiver ficado perto de fontes de interferência.

---

## Capítulo 8: Compensação de Inclinação, Pitch e Roll
Bússolas simples perdem precisão quando o aparelho está inclinado. O Shen Kua Compass calcula o azimute combinando os vetores do topo e da traseira do aparelho, o que mantém a leitura coerente em diferentes inclinações. O resultado ainda passa por um filtro de suavização que evita saltos na passagem entre 359° e 0°.

* **Pitch:** inclinação frontal/traseira (rotação em torno do eixo lateral do aparelho). Sobe ao levantar o topo do celular.
* **Roll:** inclinação lateral (rotação em torno do eixo longitudinal).
* **Nível de bolha:** acompanha Pitch e Roll em tempo real. A bolha fica vermelha quando o aparelho está praticamente plano (menos de 2° de inclinação).

Quanto mais perto do plano, melhor a precisão. Acima de cerca de 70° de inclinação, o app exibe um aviso.

---

## Capítulo 9: Qualidade do Sinal
O cartão **Sinal** resume a confiabilidade da leitura:

* **Estabilidade:** de Instável a Excelente, calculada a partir da variação recente do azimute e do movimento do aparelho.
* **Precisão:** Alta, Média ou Baixa. Considera se o sensor é absoluto, se há calibração recente (últimos 7 dias), se a estabilidade é boa e se a inclinação é moderada.
* **Calibração:** mostra há quanto tempo foi feita (ou "Nunca").

---

## Capítulo 10: Declinação Magnética
Para converter o Norte magnético em Norte verdadeiro (geográfico):

1. Descubra a declinação do seu local em uma fonte confiável, como o NOAA ou o Observatório Nacional.
2. Digite o valor no campo **Declinação**. Vírgula e ponto são aceitos.
3. Use o botão **±** para alternar entre leste (positivo) e oeste (negativo), já que o teclado numérico do Android não tem o sinal de menos.
4. A bússola e todas as leituras seguintes passam a usar o valor informado. O app salva o valor no aparelho.

Toque em **Sobre Shen Kua e a declinação** para abrir e fechar um resumo histórico. A seta ao lado indica se a aba está aberta ou fechada.

---

## Capítulo 11: Registro de Leituras e Menu Arquivo
O botão **Registrar**, na tela principal, grava uma leitura com azimute (magnético e verdadeiro), declinação, Pitch, Roll, estabilidade, precisão, data/hora e localização (se você permitir). A localização é opcional e nunca sai do aparelho.

O menu **Arquivo** reúne as ações sobre os dados:

* **Novo arquivo / Limpar leituras:** apaga o histórico, com confirmação.
* **Exportar JSON:** gera cópia de segurança estruturada.
* **Exportar Markdown (.md):** gera relatório em tabela, para Obsidian, GitHub, Notion e similares.
* **Exportar Word (.docx):** gera documento compatível com o Microsoft Word, com tabela formatada.
* **Importar JSON:** carrega arquivos exportados anteriormente e os mescla ao histórico, sem duplicar leituras.
* **Imprimir relatório:** abre a impressão (ou "Salvar como PDF") com layout próprio para papel.

---

## Capítulo 12: Resolução de Problemas e Boas Práticas
* **Aviso "Sensor relativo":** o aparelho ou o navegador não está fornecendo referência ao norte magnético. Atualize o Chrome e refaça a calibração em "8", de preferência ao ar livre.
* **Estabilidade baixa:** segure o aparelho parado por alguns segundos e evite movimentos bruscos.
* **Precisão em queda:** afaste o celular de capas com fecho magnético, caixas de som, estruturas de aço, ímãs e veículos, e recalibre.
* **Aviso "Inclinação extrema":** aproxime o aparelho da posição horizontal.
* **Nenhum dado de sensor:** confira as permissões do site, o uso de HTTPS e tente novamente.
* **Layout desatualizado após uma atualização:** feche o app por completo e abra de novo com internet.

> Os magnetômetros de celulares são sensores de consumo e erram alguns graus. Não use o app para navegação crítica.

---

## Capítulo 13: Privacidade
Todos os dados (leituras, tema, declinação e data da calibração) ficam apenas no armazenamento local do seu aparelho. Nada é enviado a servidores.
