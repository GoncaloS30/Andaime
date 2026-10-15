# ADR-0001: Stack front-end do protótipo

**Estado:** Aceite · **Data:** 2026-10-15 · **Decisores:** Gonçalo (produto), Claude (implementação)

## Contexto
O Andaime V3 é um protótipo de alta fidelidade para demonstrar a empresários. Corre inteiramente no browser, com dados fictícios, e tem de ser publicável como site estático. Mais tarde deve poder migrar para a arquitetura SaaS planeada (API Spring Boot + PostgreSQL).

## Decisão
Vite + React 19 + TypeScript strict + Tailwind CSS v4, React Router 7 (browser router com fallback SPA), Zustand 5 (immer + persist), @dnd-kit, primitivas Radix, lucide-react, date-fns, sonner, cmdk, Leaflet, exceljs (lazy). Testes com Vitest + Testing Library e Playwright + axe.

## Opções consideradas
### A: Vite + React SPA (escolhida)
| Dimensão | Avaliação |
|---|---|
| Complexidade | Baixa |
| Custo | Nulo (estático) |
| Escalabilidade | Suficiente para demo; migra para Next/SSR se necessário |
| Familiaridade | Alta |

**Prós:** build estático trivial, arranque rápido, sem servidor. **Contras:** sem SSR (irrelevante numa demo autenticada).

### B: Next.js App Router
**Prós:** alinhado com o plano de produção antigo. **Contras:** SSR/RSC sem valor numa demo só-cliente; mais configuração para export estático.

## Consequências
- Mais fácil: publicar em qualquer host estático, testes rápidos.
- Mais difícil: nada relevante para esta fase.
- Revisitar: quando houver backend real, avaliar Next.js ou manter SPA + API.
