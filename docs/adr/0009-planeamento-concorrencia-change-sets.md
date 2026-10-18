# ADR-0009: Planeamento — invariantes na base de dados, pré-visualização transacional e change-sets

**Estado:** Aceite · **Data:** 2026-10-18 · **Evolui:** ADR-0003 (atribuição diária)

## Contexto
No protótipo qualquer atribuição é gravada e os conflitos (9 tipos, `src/domain/conflicts.ts`) são detetados depois. "Anular" repõe uma cópia da base de dados inteira, revertendo também alterações de outras pessoas. Com vários utilizadores em simultâneo isto deixa de ser aceitável.

## Decisão
- **Unidade de planeamento mantém-se** (ADR-0003): trabalhador × obra × dia, com hora de início e fim **locais da obra**. A base de dados guarda também `period tstzrange` calculado (trigger) a partir do fuso IANA da obra; fim ≤ início significa que termina no dia seguinte.
- **Impossibilidades físicas são constraints** (`btree_gist`, `DEFERRABLE INITIALLY DEFERRED`):
  - um trabalhador não pode ter dois períodos sobrepostos;
  - uma viatura não pode estar em duas obras diferentes em períodos sobrepostos.
- **Regras de negócio são configuráveis por empresa** (`conflict_rule_settings`: `block` | `warn` | `off`): ausência aprovada, documento obrigatório inválido, viatura indisponível, lotação, sem encarregado, limite de horas da obra, trabalhador inativo, capacidade diária, mesmo dia em obras diferentes.
- **Pipeline único de comando:** advisory locks (`pg_advisory_xact_lock`) por trabalhador/viatura/obra afetados, **ordenados** (evita deadlocks) → aplicar alterações → `SET CONSTRAINTS ALL IMMEDIATE` (o SQLSTATE `23P01` é traduzido em conflito `sobreposicao`/`viatura_dupla`) → deteção de conflitos limitada ao âmbito afetado → diferença antes/depois.
- **Pré-visualização** = o mesmo pipeline seguido de rollback. O **commit** envia `acknowledgedConflictIds`; o servidor recalcula: conflito `block` → 409 `planning-conflicts`; `warn` não reconhecido → 409 `confirmation-required`. Assim a janela entre pré-visualizar e gravar fica fechada.
- Edições levam `expectedVersion` (optimistic locking) → 409 `stale`.
- **"Anular" passa a change-sets:** cada comando grava um `change_set` com imagens antes/depois e versões. `POST …/change-sets/{id}/revert` só reverte se todos os itens continuarem na versão gravada; a reversão é ela própria um change-set auditado.
- Copiar semana, duplicar escala e transferir trabalhador correm numa só transação (limite de 500 atribuições por comando).
- Não se usa SERIALIZABLE global (tempestades de retry em operações de lote).

## Consequências
- Mudança de UX: sobreposições de horário deixam de ser gravadas; o arrastar-e-largar mostra o 409 junto do bloco e repõe a posição.
- Os testes vitest de conflitos tornam-se fixtures partilhadas com testes JUnit parametrizados.
- Teste de concorrência obrigatório: duas threads a criar atribuições incompatíveis → exatamente uma vence.
