# Estrutura Viva do Sistema

Este documento define como organizar o sistema de ponta a ponta sem perder foco no que gera valor operacional.

## 1) Norte do produto

Objetivo central:

- controlar item unitario por QR do recebimento ate baixa/perda
- garantir rastreabilidade e auditoria de tudo
- manter operacao rapida em campo (mobile-first)

Se uma mudanca nao melhora um desses tres pontos, ela nao e prioridade.

## 2) Principio de relevancia (filtro)

Toda demanda deve passar por este filtro:

1. reduz erro operacional?
2. reduz tempo de operacao?
3. aumenta confiabilidade de estoque/auditoria?
4. reduz risco de fraude ou inconsistencia?

Se nao atender pelo menos 1 item com impacto claro, entra no backlog frio.

## 3) Mapa de dominios (bounded contexts)

### A. Identidade e Acesso

- login por telefone/OTP
- sessao de usuario
- autorizacao por perfil e local

### B. Catalogo

- produtos, grupos, regras de validade
- locais (warehouse/store)
- usuarios (perfil e local padrao)

### C. Item Unitario

- geracao de item com `token_qr` e `token_short`
- estado do item (`EM_ESTOQUE`, `EM_TRANSFERENCIA`, `BAIXADO`, `DESCARTADO`)
- local atual do item

### D. Operacoes de Estoque

- entrada compra (lote + itens unitarios)
- producao (itens unitarios)
- transferencia warehouse->store e store->store
- viagem, aceite, despacho, recebimento
- baixa diaria e perdas

### E. Controle e Governanca

- divergencias
- auditoria
- rastreio por QR
- dashboard e relatorios

## 4) Regras invariantes (nao podem quebrar)

- item unitario sempre tem QR unico
- item nunca pertence a dois locais ao mesmo tempo
- sem aceite nao pode despachar
- baixa/perda apenas para item em estoque no local correto
- toda acao critica gera auditoria
- custo nunca aparece em etiqueta/telas de loja

## 5) Estrutura tecnica recomendada

Estado atual ja possui boa base em `src/lib/services`. O alvo e consolidar tudo neste padrao:

- `src/app`: somente UI e orquestracao de tela
- `src/lib/services`: regras de negocio e casos de uso
- `src/lib/policies` (novo quando necessario): validacoes de permissao e regras fixas
- `src/lib/repositories` (novo quando necessario): acesso a dados
- `src/types/database.ts`: contrato unico de dados

Regra pratica:

- tela nao deve escrever regra critica de dominio
- tela chama servico, servico valida, persiste e audita

## 6) Checklist para novas features

Antes de implementar:

- qual dominio essa feature impacta?
- qual regra invariante pode ser afetada?
- qual evento de auditoria precisa existir?
- precisa de permissao por perfil/local?
- precisa alterar estado de item?

Ao finalizar:

- fluxo validado ponta a ponta
- erros de negocio com mensagem clara
- auditoria criada
- documentacao atualizada (`README.md` + `APP_LOGICA.md` se necessario)

## 7) Prioridade por fases (sem perder relevancia)

### Fase 1 - Blindagem operacional (curto prazo)

- autenticao real (OTP)
- reforco de permissoes no backend (RLS por perfil/local)
- mover regras criticas que ainda estao nas paginas para services

### Fase 2 - Confiabilidade de dados (medio prazo)

- padronizar transacoes em fluxos multi-etapa (transferencia/recebimento)
- trilha de auditoria completa em todas as mutacoes criticas
- consolidar relatorios com definicao unica de metricas

### Fase 3 - Escala e governanca (continuo)

- testes automatizados de casos criticos
- telemetria de erros de operacao
- revisao continua das regras por perfil e local

## 8) Definicao de pronto (Definition of Done)

Uma entrega so esta pronta quando:

- respeita as regras invariantes
- nao aumenta risco de inconsistencia
- melhora operacao real (tempo/erro/confiabilidade)
- ficou documentada de forma objetiva

---

Referencias:

- visao funcional detalhada: `APP_LOGICA.md`
- onboarding e execucao local: `README.md`
