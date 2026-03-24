# Diagrama Raiz do Sistema (V1)

Este documento define a raiz logica do sistema do Acaí do Kim antes de qualquer evolucao de tela.

## 1) Objetivo central

Garantir controle real de estoque por unidade, com rastreabilidade por QR do inicio ao fim:

- entrada
- tokenizacao (QR unico por unidade)
- movimentacao
- recebimento
- consumo/perda
- auditoria

## 2) Fronteiras do sistema

```mermaid
flowchart LR
    A[Lojas] -->|Pedido de reposicao| B[Sistema Estoque QR]
    C[Industria] -->|Entrada / Producao / Expedicao| B
    D[Transporte] -->|Aceite e entrega| B
    E[Gestao] -->|Relatorios e auditoria| B
```

## 3) Macrofluxo ponta a ponta

```mermaid
flowchart TD
    P1[Loja solicita produto] --> P2[Industria separa origem]
    P2 --> P3[Registrar entrada/producao se necessario]
    P3 --> P4[Gerar itens unitarios]
    P4 --> P5[Gerar e imprimir etiquetas QR]
    P5 --> P6[Escanear itens para transferencia]
    P6 --> P7[Aceite obrigatorio]
    P7 --> P8[Despachar]
    P8 --> P9[Receber na loja com scan]
    P9 --> P10[Comparar enviado x recebido]
    P10 -->|Sem diferenca| P11[Concluir recebimento]
    P10 -->|Com diferenca| P12[Abrir divergencias]
    P11 --> P13[Baixa diaria por consumo]
    P12 --> P13
    P13 --> P14[Relatorios e auditoria]
```

## 4) Dominios logicos (modulos)

```mermaid
flowchart LR
    subgraph D1[Identidade e Acesso]
      A1[Login telefone/OTP]
      A2[Perfis e permissoes]
    end

    subgraph D2[Cadastros]
      B1[Produtos]
      B2[Locais]
      B3[Usuarios]
    end

    subgraph D3[Item Unitario]
      C1[Token QR unico]
      C2[Estados do item]
      C3[Local atual]
    end

    subgraph D4[Operacao Industria]
      D41[Entrada compra]
      D42[Producao]
      D43[Etiquetas]
      D44[Separacao/Expedicao]
    end

    subgraph D5[Operacao Loja]
      E1[Recebimento]
      E2[Baixa diaria]
      E3[Perdas]
    end

    subgraph D6[Controle]
      F1[Divergencias]
      F2[Rastreio QR]
      F3[Relatorios]
      F4[Auditoria]
    end

    D2 --> D3
    D3 --> D4
    D4 --> D5
    D5 --> D6
    D4 --> D6
    D1 --> D4
    D1 --> D5
```

## 5) Estado do item (regra mais critica)

```mermaid
stateDiagram-v2
    [*] --> EM_ESTOQUE
    EM_ESTOQUE --> EM_TRANSFERENCIA: transferencia despachada
    EM_TRANSFERENCIA --> EM_ESTOQUE: recebimento no destino
    EM_ESTOQUE --> BAIXADO: consumo real (baixa diaria)
    EM_ESTOQUE --> DESCARTADO: perda com motivo
    BAIXADO --> [*]
    DESCARTADO --> [*]
```

## 6) Regras invariantes (nao podem quebrar)

1. Cada unidade fisica precisa ter QR unico.
2. Item so pode estar em um local por vez.
3. Sem aceite, nao existe despacho.
4. Recebimento sempre por conferência (scan).
5. Baixa/perda somente para item em estoque no local correto.
6. Toda acao critica precisa de auditoria.
7. Custo nao pode aparecer em etiqueta e em telas de loja.

## 7) Logica prioritaria da Industria (fase inicial)

```mermaid
flowchart TD
    I1[Registrar entrada ou producao] --> I2[Gerar itens unitarios]
    I2 --> I3[Gerar etiquetas]
    I3 --> I4[Imprimir etiquetas]
    I4 --> I5[Separar pedido da loja]
    I5 --> I6[Escanear itens de saida]
    I6 --> I7[Criar transferencia]
```

### Resultado esperado dessa fase

- item nasce corretamente
- etiqueta nasce de item real
- estoque da industria fica confiavel
- transferencia sai com base rastreavel

## 8) Entidades nucleares

- `produtos`
- `locais`
- `usuarios`
- `lotes_compra`
- `itens`
- `transferencias`
- `transferencia_itens`
- `viagens`
- `divergencias`
- `baixas`
- `perdas`
- `auditoria`

## 9) Eventos obrigatorios de auditoria

- `ENTRADA_COMPRA`
- `PRODUCAO`
- `CRIAR_TRANSFERENCIA`
- `ACEITAR_TRANSFERENCIA`
- `DESPACHAR_TRANSFERENCIA`
- `RECEBER_TRANSFERENCIA`
- `BAIXA`
- `DESCARTE`
- `RESOLVER_DIVERGENCIA`

## 10) Ordem recomendada (sem telas novas ainda)

1. Validar e fechar esta logica (documento).
2. Fechar regras de dominio no backend/services.
3. Fechar controles de permissao por perfil/local.
4. So depois reorganizar home e fluxos de UI.

---

Se qualquer nova ideia nao fortalecer rastreabilidade, consistencia ou velocidade operacional, ela nao entra na fase atual.
