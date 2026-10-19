# ADR-0011: Remoção do modo de demonstração

**Estado:** Aceite · **Data:** 2026-10-18 · **Substitui:** ADR-0004 (papéis e offline simulados)

## Contexto
O protótipo tem guião de apresentação, palco dividido, menu "Demonstração", seletor livre de papel/persona, flags de "empresa sem dados" e "falha de ligação", e uma store local com dados fictícios. Num produto real nada disto pode coexistir com dados de clientes.

## Decisão
- Na fase F1 saem da aplicação: guião e realce (`features/presentation`), palco dividido, menu Demonstração, seletor de papel e de persona, "Ver como", flags de simulação e os controlos de demo das Definições. `/design` (galeria do design system) só existe em desenvolvimento.
- O papel vem da **membership real** na organização ativa: OWNER, ADMIN e MANAGER veem a experiência de gestor; FOREMAN a de encarregado; WORKER a app do trabalhador.
- **Transição honesta:** na aplicação real, os módulos ainda não ligados ao servidor mostram "Ainda não ligado ao servidor" com a fase prevista — nunca dados fictícios. O protótipo antigo continua no repositório apenas como referência e para os testes E2E dos módulos por migrar: só arranca nos modos de build `e2e` e `prototipo` e é eliminado do build de produção. Cada módulo migrado apaga o seu código de protótipo; no fim (F6) a store local e a semente TS desaparecem.

*Revisto em 2026-10-19:* a ideia inicial de servir o protótipo em `/demo/*` dentro da aplicação real foi abandonada — os ecrãs antigos têm ligações absolutas e misturariam navegação real com dados fictícios.
- Dados de demonstração para desenvolvimento e vendas passam a ser uma **organização real semeada no backend** por comando explícito e idempotente, proibido no perfil `prod`.

## Consequências
- Os testes E2E que liam a store (`window.__andaime`) são reescritos contra a API real, módulo a módulo, com uma organização nova por teste.
- O README deixa de anunciar o protótipo como produto; `docs/limitacoes.md` passa a descrever o estado da migração.
