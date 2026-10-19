# Andaime — gestão operacional para empresas de construção

[![CI](https://github.com/GoncaloS30/Andaime/actions/workflows/ci.yml/badge.svg)](https://github.com/GoncaloS30/Andaime/actions/workflows/ci.yml)

Centro de operações para empresas de construção: **planeamento → execução → controlo → análise** de trabalhadores, equipas, viaturas e obras em Portugal e no estrangeiro.

> **Em migração de protótipo para SaaS.** Contas, empresas (multiempresa), papéis, convites, sessões e auditoria já são reais: API Spring Boot + PostgreSQL com isolamento por empresa (RLS). Os módulos operacionais são ligados ao servidor por fases e, até lá, a aplicação diz que ainda não estão ligados — sem dados fictícios. Estado e próximos passos: [docs/backend/estado.md](docs/backend/estado.md). Arquitetura: [docs/backend/arquitetura.md](docs/backend/arquitetura.md).

## Arrancar

Infraestrutura e API (Docker no WSL; portas próprias, não interfere com outros projetos):

```bash
wsl -d Ubuntu -- docker compose -f infra/compose.yaml up -d --build
```

Frontend (o Vite encaminha `/api` para a API em `localhost:8088`):

```bash
npm ci
npm run dev        # http://localhost:5173
```

Emails de desenvolvimento (confirmação de conta, convites, recuperação): http://localhost:58035.

O protótipo antigo, com dados fictícios locais, continua disponível só para referência e testes dos módulos por migrar: `npm run dev:prototipo`. Não entra no build de produção.

Para contribuir (ramos, commits, pull requests e versões), ver [CONTRIBUTING.md](CONTRIBUTING.md). Alterações por versão em [CHANGELOG.md](CHANGELOG.md). Software proprietário: ver [LICENSE](LICENSE).

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
| `npm test` | Vitest — domínio, store, semente, Excel, Word, componentes (182 testes) |
| `npm run fotos` | Gera as fotos tratadas (WebP), o manifesto e os créditos a partir de `scripts/fotos.manifest.json` e de `fotos-originais/` (fora do git) |
| `npm run fotos:folha` | Folha de contacto das fotos em `docs/review/fotos-folha.html` |
| `npm run e2e` | Playwright — 17 fluxos, guião, acessibilidade (axe) em desktop/tablet/telemóvel. Usa o Microsoft Edge instalado |
| `npx playwright test -g @quality` | Quality gate: capturas a 1440/1024/768/390/360 px em `docs/review/screens`, overflow, foco, movimento reduzido, JS lento |

## Como demonstrar

1. Abra o **Centro de operações** e carregue em **Apresentar** (canto superior direito).
2. O **guião** tem uma visita rápida e 11 capítulos. Cada passo prepara o estado de que precisa, muda o papel quando é preciso e realça o elemento a mostrar — funciona em qualquer ordem, mesmo depois de repor os dados.
3. Nos capítulos 5, 6 e 10 abre-se o **palco dividido**: o telemóvel do trabalhador ao lado do backoffice, sobre o mesmo estado. No capítulo 11 o telemóvel é o do encarregado, com o diário de obra.
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
| 10 Dormidas | Dormidas → marcar hotel (ou ficha da obra → Alojamento) |
| 11 Diário de obra | Ficha da obra → Diário (ou Encarregado → Diário) → Word/Excel |
| 12 Férias | Ausências → Mapa do ano · Agenda → Sincronizar férias (Google simulado) |
| 13 Livro do RH | Horas → Livro do RH → Excel ou OneDrive (simulado) |
| 14 Grelha da semana | Horas → Grelha da semana |
| 15 Fotos | Ficha do trabalhador → Alterar foto |
| 16 Folha de entrega de EPI | Ficha → Equipamentos → Folha de entrega (Imprimir ou Excel) |
| 17 Cópia da demonstração | Definições → Exportar / Importar cópia |

## Novo na V3.1

Funcionalidades da última versão do Lyrical Design e fotos em toda a app (spec `docs/superpowers/specs/2026-10-16-andaime-lyrical-fotos-design.md`):

- **Fotos** de trabalhadores, gestores, obras, viaturas, EPI e hotéis, com carregamento de fotos próprias.
- **Diário de obra** com fotos, pesquisa e exportação Word/Excel.
- **Dormidas e hotéis** a partir da escala, com "Onde durmo esta semana" na app do trabalhador.
- **Ausências:** tipos novos e mapa de férias do ano. **Agenda** com eventos, prazos de obra e Google Calendar simulado. **Fim contratual** com aviso de atraso.
- **Horas:**
  - totais por semana, mês e ano;
  - grelha da semana com correção e motivo;
  - livro de horas do RH em Excel, com OneDrive simulado;
  - gráficos "Como correu a semana" e donut por obra.
- **EPI:** folha de entrega para assinar e artigos novos a partir da ficha.
- **Definições:** integrações, cópia da demonstração (JSON) e créditos das fotos.

## Fotos

As 100 fotos da demonstração (trabalhadores, gestores, obras, viaturas, EPI, diário e hotéis) são fotos de banco do Pexels com licença livre, tratadas em WebP com a cor da marca. Créditos em **Definições → Créditos das fotos** e em `public/fotos/CREDITOS.md`. As pessoas retratadas não têm relação com os nomes fictícios. Quem usa a demo pode carregar fotos próprias (ficam no IndexedDB deste navegador; "Repor demonstração" apaga-as).

## Arquitetura

- **Vite + React 19 + TypeScript strict + Tailwind CSS v4**, React Router 8 (rotas carregadas à parte), Zustand + immer, @dnd-kit, Radix, Leaflet, ExcelJS (carregado só ao exportar). Decisões em [docs/adr](docs/adr).
- `src/domain` — regras puras e testadas: semanas ISO, horas normais/extra, métricas de obra (limite, realizadas, aprovadas, planeadas futuras, saldo, projeção), disponibilidade, **9 tipos de conflito com correções executáveis**, documentos por país, mapas semanais, diário, dormidas, mapa de férias, agenda, totais e livro do RH, folha de entrega, cópia da demonstração.
- `src/data/seed` — semente determinística relativa a "hoje": 42 trabalhadores, 8 equipas, 11 viaturas, 9 obras em 4 países, 4 semanas de horas, conflitos plantados, diário das últimas 3 semanas, 7 hotéis, férias do ano e eventos de agenda.
- `src/store` — **uma store como fonte única de verdade**: ações com nome (mutadores puros reutilizados nas pré-visualizações), histórico, notificações, anular, caixa de saída offline, persistência versionada. Os ecrãs só leem *selectors* memoizados — uma ação num módulo aparece em todos.
- `src/features/*` — um módulo por área (fatias verticais, prontas para migrar para API).
- `src/ui` — design system ([docs/design-system.md](docs/design-system.md)); galeria viva em `/design`.

Especificações: [V3](docs/superpowers/specs/2026-10-15-andaime-v3-design.md) · [V3.1](docs/superpowers/specs/2026-10-16-andaime-lyrical-fotos-design.md) · Relatório de revisão: [docs/review-report.md](docs/review-report.md).
