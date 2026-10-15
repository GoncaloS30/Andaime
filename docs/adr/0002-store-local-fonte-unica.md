# ADR-0002: Uma store local como fonte única de verdade

**Estado:** Aceite · **Data:** 2026-10-15

## Contexto
O briefing exige que uma ação num módulo se reflita automaticamente em todos os outros (ficha do trabalhador, equipa, obra, planeamento, dashboard). O Mesa provou que uma store única com ações nomeadas funciona, mas tinha re-render global e nenhuma persistência.

## Decisão
- `useDemoStore` (Zustand) guarda `db` normalizado (`Record<id, T>`) e `session` (papel, persona, flags, guião, outbox).
- Todas as mutações passam por **ações nomeadas** que validam com funções puras de `src/domain`, alteram `db`, registam `ActivityEvent` e notificações.
- Nenhum ecrã guarda dados derivados: KPIs, conflitos e métricas são **selectors memoizados**.
- Persistência opcional em `localStorage` com `version`; divergência de versão → nova semente.

## Opções consideradas
- **Zustand (escolhida):** mínima, sem providers, selectors finos, middleware persist/immer.
- **Redux Toolkit:** mais cerimónia sem ganho para um protótipo.
- **Context + useReducer:** re-renders largos com dezenas de trabalhadores.

## Consequências
- As ações de `store/slices` mapeiam 1:1 para futuros endpoints da API; os selectors mapeiam para queries.
- Testes de fluxo podem correr só contra a store (sem UI).
- Revisitar: com backend, substituir as ações por chamadas com otimismo (TanStack Query).
