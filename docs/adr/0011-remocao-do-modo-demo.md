# ADR-0011: Remoção do modo de demonstração

**Estado:** Aceite · **Data:** 2026-10-18 · **Substitui:** ADR-0004 (papéis e offline simulados)

## Contexto
O protótipo tem guião de apresentação, palco dividido, menu "Demonstração", seletor livre de papel/persona, flags de "empresa sem dados" e "falha de ligação", e uma store local com dados fictícios. Num produto real nada disto pode coexistir com dados de clientes.

## Decisão
- Na fase F1 saem da aplicação: guião e realce (`features/presentation`), palco dividido, menu Demonstração, seletor de papel e de persona, "Ver como", flags de simulação e os controlos de demo das Definições. `/design` (galeria do design system) só existe em desenvolvimento.
- O papel vem da **membership real** na organização ativa: OWNER, ADMIN e MANAGER veem a experiência de gestor; FOREMAN a de encarregado; WORKER a app do trabalhador.
- **Transição honesta:** os módulos ainda não ligados ao servidor ficam acessíveis apenas em `/demo/*`, com faixa permanente "Protótipo — dados fictícios locais", e nunca se misturam com dados da organização. Na navegação real aparecem como "Ainda não ligado ao servidor". Cada módulo sai de `/demo` quando é migrado; no fim (F6) a store local e a semente TS são apagadas.
- Dados de demonstração para desenvolvimento e vendas passam a ser uma **organização real semeada no backend** por comando explícito e idempotente, proibido no perfil `prod`.

## Consequências
- Os testes E2E que liam a store (`window.__andaime`) são reescritos contra a API real, módulo a módulo, com uma organização nova por teste.
- O README deixa de anunciar o protótipo como produto; `docs/limitacoes.md` passa a descrever o estado da migração.
