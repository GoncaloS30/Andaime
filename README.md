# Andaime V3 — protótipo demonstrativo

Centro de operações para empresas de construção: **planeamento → execução → controlo → análise** de trabalhadores, equipas, viaturas e obras em Portugal e no estrangeiro.

> **Protótipo de alta fidelidade.** Corre inteiramente no navegador com **dados fictícios** ("Construções Ribeira Alta, S.A."). Não há servidor, autenticação nem envio de dados. As permissões e o modo offline são **simulados**. Ver [docs/limitacoes.md](docs/limitacoes.md).

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173
```

Build estático (pronto para Vercel/Netlify — inclui `vercel.json` e `_redirects` para o fallback SPA):

```bash
npm run build      # gera dist/
npm run preview
```

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | TypeScript + build de produção |
| `npm run typecheck` | `tsc -b` (TypeScript strict) |
| `npm run lint` | ESLint |
| `npm test` | Vitest — domínio, store, semente, Excel, componentes (102 testes) |
| `npm run e2e` | Playwright — 9 fluxos, guião, acessibilidade (axe) em desktop/tablet/telemóvel. Usa o Microsoft Edge instalado |
| `npx playwright test -g @quality` | Quality gate: capturas a 1440/1024/768/390/360 px em `docs/review/screens`, overflow, foco, movimento reduzido, JS lento |

## Como demonstrar

1. Abra o **Centro de operações** e carregue em **Apresentar** (canto superior direito).
2. O **guião** tem uma visita rápida e os 9 fluxos. Cada passo prepara o estado de que precisa, muda o papel quando é preciso e realça o elemento a mostrar — funciona em qualquer ordem, mesmo depois de repor os dados.
3. Nos fluxos 5 e 6 abre-se o **palco dividido**: o telemóvel do trabalhador ao lado do backoffice, sobre o mesmo estado.
4. **Explorar livremente** fecha o guião sem repor nada. **Recomeçar** repõe a demonstração.
5. O seletor de **papel** (Gestor · Encarregado · Trabalhador) está sempre visível; cada papel tem a sua persona escolhível.
6. O menu **Demonstração** permite guardar no navegador, simular empresa sem dados, simular falha de ligação e repor os dados.

| Fluxo | Onde |
|---|---|
| 1 Criar obra | Obras → Nova obra |
| 2 Criar escala | Planeamento → Nova escala |
| 3 Transferir trabalhador | Ficha do trabalhador → Transferir |
| 4 Viaturas | Viaturas → Atribuir viatura (ou conflito no Planeamento) |
| 5 Registar horas | App do trabalhador → Encarregado → Horas e aprovações |
| 6 Ausência | App → Ausências → Gestor → Ausências |
| 7 Equipamento | Ficha → Fardamento → Registar entrega |
| 8 Mapas semanais | Mapas semanais → Exportar Excel |
| 9 Documentos | Documentos → Atualizar |

## Arquitetura

- **Vite + React 19 + TypeScript strict + Tailwind CSS v4**, React Router 8 (rotas carregadas à parte), Zustand + immer, @dnd-kit, Radix, Leaflet, ExcelJS (carregado só ao exportar). Decisões em [docs/adr](docs/adr).
- `src/domain` — regras puras e testadas: semanas ISO, horas normais/extra, métricas de obra (limite, realizadas, aprovadas, planeadas futuras, saldo, projeção), disponibilidade, **9 tipos de conflito com correções executáveis**, documentos por país, mapas semanais.
- `src/data/seed` — semente determinística relativa a "hoje": 42 trabalhadores, 8 equipas, 11 viaturas, 9 obras em 4 países, 4 semanas de horas, conflitos plantados.
- `src/store` — **uma store como fonte única de verdade**: ações com nome (mutadores puros reutilizados nas pré-visualizações), histórico, notificações, anular, caixa de saída offline, persistência versionada. Os ecrãs só leem *selectors* memoizados — uma ação num módulo aparece em todos.
- `src/features/*` — um módulo por área (fatias verticais, prontas para migrar para API).
- `src/ui` — design system ([docs/design-system.md](docs/design-system.md)); galeria viva em `/design`.

Especificação: [docs/superpowers/specs/2026-10-15-andaime-v3-design.md](docs/superpowers/specs/2026-10-15-andaime-v3-design.md) · Relatório de revisão: [docs/review-report.md](docs/review-report.md).
