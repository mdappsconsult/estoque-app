# Impressão térmica (ex.: Zebra ZD220) a partir do navegador

O app gera **HTML + CSS** com `@page` em **60×30 mm** (duas metades com QR na mesma etiqueta física). Impressoras térmicas **não** interpretam isso como uma impressora de escritório: se algo estiver errado no **driver**, no **tamanho do papel** ou na **calibração da mídia**, aparecem:

- etiquetas **em branco**;
- texto **cortado entre duas etiquetas** (conteúdo “atravessando” o gap);
- trechos que parecem **descer** ao longo do rolo (**deriva** no eixo Y);
- conteúdo **minúsculo** grudado no **canto superior esquerdo**, com **muito branco** à direita e embaixo (tema desta seção abaixo).

---

## Por que sai pequeno no canto (driver Zebra + Chrome/Edge) — estudo do fluxo

Isso **não é ZPL** no fio: o navegador manda um fluxo **GDI / raster** (imagem da página) para o spooler do Windows. O **driver ZDesigner** (ou Zebra) recebe essa página e precisa **casar** duas coisas:

1. **Qual “folha lógica” o Windows acha que está imprimindo** (Letter, A4, ou um **stock** que você criou).
2. **Qual tamanho físico a impressora vai usar** na etiqueta.

### O que dá errado na prática

- Se o **stock / tamanho do papel** no driver continuar **Letter, A4** ou um tamanho **bem maior** que 60×30 mm, o Chrome costuma **montar a página nesse tamanho grande** e desenhar o seu HTML (que ocupa só uma faixa) como um **retângulo pequeno** dentro desse canvas.
- O driver, ao mandar para a ZD220, **encolhe o bitmap inteiro** para caber na **largura** (ou área) da etiqueta. Resultado: **tudo fica minúsculo** e frequentemente **no canto superior esquerdo** — exatamente o efeito “só 1/4 da etiqueta preenchida”.

Ou seja: o problema é, na maior parte dos casos, **descompasso entre o tamanho de papel do driver + diálogo de impressão** e a etiqueta **60×30 mm**, **não** o texto “LEITE PO” em si.

### O que fazer no driver Zebra (Windows) — passo a passo

Use o driver **ZDesigner** (ou Zebra oficial) da [Zebra Support](https://www.zebra.com/us/en/support-downloads.html), **não** só o “Microsoft IPP Class Driver” genérico (ele costuma **não** expor stocks corretos).

1. **Painel de controle** → **Dispositivos e impressoras** → clique direito na **ZD220** → **Preferências de impressão** (ou **Propriedades da impressora** → **Preferências**).
2. **Page Setup** / **Configuração de página**:
   - **Unidades:** **milímetros** (mm).
   - **Largura:** **60** mm, **Altura:** **30** mm (igual ao rolo **60×30** que você usa com o app).
3. **Tipo de mídia:** etiqueta com **gap** (espaço entre etiquetas) ou **contínua**, conforme o material — alinhado ao manual da ZD220.
4. Aba **Stocks** (em muitas versões do driver): **Novo** → nome ex. `Estoque-60x30` → mesmas dimensões → **definir como padrão** / **Apply**. Na central de suporte Zebra, busque por *ZDesigner* + *Page Setup* / *Stocks* / *label size* para o guia da sua versão do driver.
5. **DPI:** para ZD220, em geral **203 dpi** (padrão) — não altere sem necessidade.
6. Confirme que **não** há opção de **escala** / **ajustar à página** ativa nas preferências (deixe **100%** / sem encolher).

Depois disso, no **Chrome**, ao imprimir de novo:

- **Tamanho do papel:** escolha o **mesmo** stock / tamanho personalizado **60×30** (deve aparecer após criar no driver).
- **Escala:** **100%**, **sem** “Ajustar à página”.

### Diálogo do sistema (recomendado)

No Chrome/Edge, use **Imprimir usando o diálogo do sistema** (ou atalho que abre o diálogo clássico do Windows), para ver **todas** as opções do driver Zebra (stocks, mídia, avanço). Só o diálogo minimalista do Chrome às vezes **esconde** o formato certo.

### macOS

Em **Preferências de sistema** → **Impressoras** → impressora Zebra → **Opções** / driver: defina **tamanho personalizado** com **60 mm × 30 mm** ou perfil equivalente ao stock. A lógica é a mesma: **página lógica = etiqueta física**.

### QR “não lê” e traço falhado / granulado

- **QR pequeno ou borrado:** o app pede imagem do QR em **resolução alta** e reduz no CSS para mm; ainda assim, no driver aumente **escuridão** (*darkness*) e reduza **velocidade** um pouco. Evite modo que **dither** forte em imagens (alguns drivers têm “qualidade gráfica” / suavização — para QR e linhas, prefira nitidez).
- **Página de teste Zebra** com bolas pixeladas: é **meio-tom** do driver; em etiquetas reais o QR do app é preto e branco — com escuridão adequada costuma melhorar.

### Ainda corta borda da etiqueta (topo/fundo)

A área **realmente imprimível** costuma ser **menor** que 30×60 mm (mecânica + sensor). O app usa **padding interno** (~**2,3 mm** topo, ~**0,85 mm** fundo, laterais ~**0,65 mm**) e QR/texto um pouco menores. Se ainda cortar, no driver confira **offset** / calibração ou reduza mais o conteúdo no código.

### Listras verticais brancas no meio do QR / texto “quebrado”

Isso **não é** layout do HTML: costuma ser **cabeça de impressão suja ou desgastada**, **pino de pressão**, ou **escuridão** muito baixa. Limpe a cabeça com **caneta de limpeza / cassete** conforme o manual ZD220; aumente um pouco a **darkness** no driver e teste de novo. Enquanto houver falhas verticais, o **QR pode não ler** mesmo com tamanho certo no app.

### Rumo a uma impressão “perfeita” (checklist)

1. **Driver:** stock **60×30 mm**, sem escala estranha; escuridão e velocidade equilibradas.  
2. **Navegador:** sem cabeçalhos/rodapés, margens nenhumas, escala 100%.  
3. **Hardware:** mídia calibrada, cabeça limpa, sem listras.  
4. **App:** QR grande o suficiente, data em preto forte e fonte menor (ajustes em `label-print`).

### Página de teste do driver (retângulo de alinhamento)

No driver Zebra, o botão **Página de teste** imprime um retângulo com texto do tipo *“Use este retângulo para ajustar a posição do rótulo”*. Se **essa** borda já sair **torta** (muito à direita/baixo ou cortada), o problema **não é o app** — é **calibração de mídia** na impressora e/ou **deslocamento** (*offset*) nas preferências do driver (ex.: marcar deslocamento, ajuste fino). Ajuste até o retângulo ficar centrado na etiqueta física; depois disso, as etiquetas do sistema tendem a acompanhar o mesmo alinhamento.

---

## 1. Caixa de impressão do navegador (obrigatório conferir)

No Chrome / Edge, em **Imprimir** → **Mais definições**:

- **Cabeçalhos e rodapés:** **desligado** — se estiver ligado, o título da página e a data viram faixas extras e **desalinhamento** (o app já usa título vazio na janela de impressão para ajudar).
- **Margens:** **Nenhuma** (ou mínimo).
- **Escala:** **100%** — evitar “Ajustar à página”, que distorce mm.
- **Tamanho do papel:** se existir, criar/usar formato personalizado **60 mm × 30 mm** (largura × altura conforme o rolo que você usa). Se o driver só mostrar A4, o resultado costuma ser ruim até você definir o tamanho no **driver Zebra**.

## 2. Calibração da Zebra (mídia com gap)

Sem calibração, a impressora **não sabe** onde termina cada etiqueta.

- Consulte o manual da **ZD220** para **calibração de mídia** (em geral: com etiquetas carregadas, **manter o botão Feed** até piscar / soltar — varia por firmware).
- Depois da calibração, faça um **Feed** e confira se para **uma etiqueta** por avanço.

## 3. Driver e tamanho no Windows / macOS

- Instalar **Zebra Setup Utilities** ou driver oficial (**ZDesigner**, etc.).
- Criar um **tamanho de etiqueta** igual ao físico: **largura 60 mm**, **altura 30 mm**, com **gap** (espaço entre etiquetas) coerente com o rolo.
- No macOS, em **Opções da impressora**, alinhar tamanho personalizado ao mesmo valor.

## 4. O que o software já assume

- Uma **página** de impressão = **uma etiqueta física** 60×30 mm com **dois QRs** lado a lado (recorte no pontilhado no meio).
- O layout 60×30 usa **`display: table` / `table-cell`** com metades em **mm fixos** (em vez de flex), para drivers térmicos não deslocarem tudo para um canto da etiqueta.
- QR é imagem remota (`api.qrserver.com`) — precisa de **internet** no momento da impressão.

## 5. Se ainda falhar

- Testar outro navegador (às vezes **Firefox** ou outro trata `@page` diferente).
- Gerar **PDF** “Salvar como PDF” com tamanho custom 60×30 e enviar ao utilitário Zebra, se o fluxo do seu ambiente permitir.
- Para produção em volume, avaliar no futuro **ZPL** gerado no servidor (fora do escopo atual do app).
