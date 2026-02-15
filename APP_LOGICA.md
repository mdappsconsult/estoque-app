APP LOGICA - CONTROLE DE ESTOQUE QR

Objetivo
- PWA de controle de estoque por unidade com QR serializado.
- Frontend: Next.js + React + CSS.
- Backend: Supabase (Auth + Postgres + RLS).
- Fluxo focado em entrada, transferencia, conferencias e baixa diaria.
- Auditoria completa e rastreio do QR do inicio ao fim.

Autenticacao e usuarios
- Login somente por telefone.
- Autenticacao via codigo OTP enviado por WhatsApp.
- Nao usar e-mail.
- Cada usuario possui: nome, telefone (unico), perfil (role), local padrao.

Perfis
- ADMIN_MASTER
- MANAGER
- OPERATOR_WAREHOUSE (industria / estoque)
- OPERATOR_STORE
- DRIVER

Regras gerais
- Usuario so opera o local vinculado.
- Admin Master ve e controla tudo.
- Loja nao ve custos.

Locais (dinamicos)
- Cadastro de Locais genericos com tipo: WAREHOUSE | STORE.
- Um item sempre pertence a um local por vez ou esta em transferencia.

Produtos
- Cada produto possui: nome, categoria, exige validade, exige lote.

Entrada de produtos (sempre por lote)

Entrada por compra (distribuidora)
- Campos obrigatorios: produto, quantidade, custo unitario, validade (se aplicavel), local de entrada (WAREHOUSE).
- Lote do fornecedor e opcional.
- Cada compra gera um lote de compra.
- Cada unidade gera 1 QR unico.
- QR nao contem preco.
- Custo fica salvo no lote.
- Loja nao tem acesso ao custo.

Entrada por producao
- Campos: produto, quantidade, validade/lote (se aplicavel), local de entrada (WAREHOUSE).

Estados do item (simplificado)
- EM_ESTOQUE
- EM_TRANSFERENCIA
- BAIXADO (CONSUMIDO)
- DESCARTADO
- Nao existe "EM USO".

Transferencias (sempre por QR)

Warehouse -> Store
1. Origem cria transferencia.
2. Escaneia os QRs (separacao).
3. Transporte deve aceitar a carga.
4. Itens mudam para EM_TRANSFERENCIA.
5. Loja recebe escaneando QRs.
6. Sistema compara enviado x recebido.
7. Diferenca gera divergencia automatica.

Viagem (entrega para varias lojas)
- Separacao por loja.
- Cada loja gera uma transferencia.
- Transferencias agrupadas em uma viagem.
- Entregador aceita a viagem antes de sair.

Transferencia loja -> loja (emergencial)
- Loja A cria transferencia.
- Escaneia itens.
- Status: AWAITING_ACCEPT.
- Loja B deve aceitar.
- Sem aceite, Loja B nao consegue receber.
- Apos aceite: Loja A despacha e Loja B recebe escaneando QR.

Baixa diaria (consumo real)
- Durante o dia, nenhum scan.
- A noite, funcionario escaneia QRs das embalagens vazias.
- Cada QR vira BAIXADO.
- Produto baixado sai definitivamente do estoque.
- Nao pode ser transferido.
- Nao pode ser baixado novamente.

Perdas
- Produto fechado pode ser descartado.
- Exige motivo.
- Estado vira DESCARTADO.

Auditoria (obrigatoria)
Registrar toda acao com:
- usuario
- local
- data/hora
- acao
- item (QR)
- origem/destino (quando houver)
- Rastreio completo do QR do inicio ao fim.

Relatorios (admin / manager)
Relatorios minimos:
1. Movimento diario por loja: entrou, saiu por consumo, saiu por descarte, estoque final.
2. Consumo medio por produto: media diaria (7/14/30 dias).
3. Transferencias: enviado x recebido e divergencias.
4. Estoque atual por loja com alerta de validade.
5. Perdas por loja/produto.

Custos
- Visiveis apenas para ADMIN / MANAGER.
- Calculo de custo medio ponderado por lote.

Telas (UX simples / Apple-like)
- Login (telefone + codigo)
- Home (cards grandes)
- Scanner (tela central)
- Entrada de Compra
- Producao
- Separar por Loja
- Aceite do Transporte
- Receber Entrega
- Transferencia Loja -> Loja
- Aceites Pendentes
- Baixa Diaria
- Divergencias
- Estoque (leitura)
- Rastreio por QR
- Dashboard Admin

Arquitetura (obrigatoria)
- Componentizacao maxima.
- Nenhuma regra de negocio em telas.
- Separar: UI Components, Feature Components, UseCases, Policies, Repositories, Domain Models.

Regras fixadas (clarificacoes obrigatorias)
1) Aceite do transporte obrigatorio e bloqueia despacho
- Nao pode despachar transferencia/viagem sem aceite do DRIVER.
- Botao "Despachar" so aparece apos DRIVER aceitar.

2) Divergencia: itens faltantes
- Se enviado > recebido: itens faltantes permanecem EM_TRANSFERENCIA.
- Ficam em fila de Pendencias/Divergencias ate resolucao por MANAGER/ADMIN.

3) Loja -> Loja: aceite antes do despacho
- Loja A nao pode despachar para Loja B sem Loja B aceitar.
- Sem aceite, transferencia fica AWAITING_ACCEPT.
- Itens continuam EM_ESTOQUE na Loja A, mas reservados.

4) Baixa diaria valida local
- So pode baixar item EM_ESTOQUE no local do usuario.
- Se item for de outro local ou em transferencia, bloquear e mostrar erro.

5) Etiqueta (sem custo)
- Imprimir: nome do produto, validade, lote (opcional), data/hora de geracao, token_short, QR contendo token_qr.
- Nunca imprimir custo.

6) Relatorios: definicoes exatas
- Entrou = itens recebidos via transferencia no dia (RECEBIMENTO).
- Saiu (consumo) = itens BAIXADOS no dia.
- Saiu (descarte) = itens DESCARTADOS no dia.
- Estoque final = contagem EM_ESTOQUE no fim do dia por local.
