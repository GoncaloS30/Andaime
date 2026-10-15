# ADR-0004: Papéis e offline são simulados

**Estado:** Aceite · **Data:** 2026-10-15

## Contexto
O protótipo mostra três experiências (Gestor, Encarregado, Trabalhador) e um modo offline na app do trabalhador. Não há autenticação nem servidor.

## Decisão
- O papel e a persona ativos vivem em `session`. `RoleGate` e os selectors filtram rotas, navegação e dados pelo âmbito da persona. Isto **não é segurança**: é demonstração de âmbitos.
- O offline é um interruptor "Sem rede": as ações do trabalhador vão para uma `outbox` visível e só alteram `db` quando o utilizador sincroniza. Não há service worker.
- A interface identifica sempre "Demonstração · dados fictícios".

## Consequências
- Não se fazem promessas de segurança, persistência remota ou offline real (ver `docs/limitacoes.md`).
- Em produção: autenticação real, RLS por empresa, e a estratégia offline do plano Andaime anterior (outbox + motor de sincronização + idempotência).
