# Arquitetura do Andaime SaaS

Decisões: [ADR-0006](../adr/0006-backend-monolito-modular.md) (monólito modular), [0007](../adr/0007-multi-tenancy-rls.md) (multiempresa), [0008](../adr/0008-autenticacao-sessoes.md) (sessões), [0009](../adr/0009-planeamento-concorrencia-change-sets.md) (planeamento), [0010](../adr/0010-modelo-de-tempo-e-politica-laboral.md) (tempo), [0011](../adr/0011-remocao-do-modo-demo.md) (fim do modo demo).

## Visão geral

```
Browser (React SPA, mesma origem)
   │  cookie ANDAIME_SESSION (HttpOnly) + X-XSRF-TOKEN
   ▼
Vite dev proxy / reverse proxy  ──►  Spring Boot API (:8088)
                                        │  Hikari (andaime_app, RLS)
                                        ├──► PostgreSQL 18 (:55442)
                                        ├──► SMTP (Mailpit :51035 em dev)
                                        └──► S3 (MinIO :59010 em dev, F5)
```

## Módulos do backend (`backend/src/main/java/pt/andaime`)

| Módulo | Responsabilidade | Fase |
|---|---|---|
| `shared` | Contexto de tenant, transação com RLS, ProblemDetail, ids, relógio, idempotência | F1 |
| `identity` | Utilizadores, passwords, sessões, verificação de email, reposição, throttling | F1 |
| `organization` | Organizações, memberships, papéis, convites, onboarding | F1 |
| `platform` | Administração da plataforma, suspensão, acesso de suporte | F1 |
| `policy` | Política laboral, feriados, severidade das regras de conflito | F1 (estrutura), F4 (cálculo) |
| `audit` | Registo de auditoria só por acrescento | F1 |
| `workforce` | Trabalhadores, contratos, competências, equipas e composição datada | F2 |
| `sites` | Clientes, obras, ocorrências, notas da semana, métricas | F2 |
| `fleet` | Viaturas, indisponibilidades, ligação viatura–equipa | F3 |
| `planning` | Atribuições, conflitos, pré-visualização, change-sets, transferências, cópia de semana | F3 |
| `timekeeping` | Ponto, registos, pausas, revisões, folhas semanais e aprovações | F4 |
| `absences` | Pedidos, decisões, calendário, impacto no planeamento | F5 |
| `documents` | Tipos, requisitos por país, documentos, versões, ficheiros (S3), alertas | F5 |
| `equipment` | Catálogo, stock, unidades com série, entregas e devoluções | F5 |
| `notifications` | Notificações persistentes, SSE | F5 |
| `reporting` | Read models, mapas semanais, Excel/PDF, exportações assíncronas | F6 |

## Ecrã → API → fase

| Ecrã (frontend atual) | Endpoints | Fase |
|---|---|---|
| Entrar, registar, recuperar, convite, onboarding (novos) | `/api/auth/*`, `/api/me`, `/api/orgs`, `/api/invitations/*` | F1 |
| Definições → Equipa e acessos (novo) | `/api/orgs/{orgId}/members`, `/invitations` | F1 |
| Trabalhadores, Equipas (`features/workers`, `features/teams`) | `/employees`, `/teams` | F2 |
| Obras, Mapa (`features/sites`, `features/geo-map`) | `/clients`, `/sites`, `/sites/{id}/metrics` | F2 |
| Planeamento, Encarregado (semana) (`features/planning`, `foreman`) | `/planning/*` | F3 |
| Viaturas (`features/vehicles`) | `/vehicles`, `/teams/{id}/vehicle` | F3 |
| Horas e aprovações, app do trabalhador (`features/timesheets`, `worker-app`, `foreman`) | `/me/clock/*`, `/time-entries`, `/timesheets` | F4 |
| Ausências (`features/absences`) | `/absences` | F5 |
| Documentos (`features/documents`) | `/document-types`, `/documents`, `/compliance` | F5 |
| Equipamentos (`features/equipment`) | `/equipment/*` | F5 |
| Notificações (shell) | `/notifications`, `/notifications/stream` | F5 |
| Centro de operações, Mapas semanais, Relatórios | `/reporting/*`, `/exports` | F3–F6 |

Contratos detalhados: [api.md](api.md). Modelo: [modelo-dados.md](modelo-dados.md). Segurança: [seguranca.md](seguranca.md). Critérios: [criterios-aceitacao.md](criterios-aceitacao.md). Estado atual: [estado.md](estado.md).

## Frontend

- Mantém Vite + React 19 + Tailwind 4 + React Router 8, componentes e design system.
- `src/api/http.ts`: `fetch` na mesma origem, cookie de sessão, CSRF, `ProblemDetail` → `ApiError`; 401 → ecrã de entrada; 403 → "Sem acesso"; 429 → aviso com `Retry-After`.
- **TanStack Query** atrás de uma fachada de hooks por módulo (`src/data/<módulo>.ts`). Os componentes não chamam `fetch`.
- Chaves de query incluem sempre `orgId`; mudar de organização limpa o cache.
- Tipos da API gerados do OpenAPI do backend (a partir de F2).

## Inventário de simulações a eliminar (auditoria F0)

| Simulação | Onde | Destino |
|---|---|---|
| Store local como base de dados (`andaime:demo`) | `src/store/*`, `persistence.ts` | API + PostgreSQL, módulo a módulo; apagada em F6 |
| Semente fictícia ("Construções Ribeira Alta", 42 trabalhadores, notificações e atividade fictícias, conflitos plantados) | `src/data/seed/*` | Semente Java de desenvolvimento, explícita e idempotente (F2) |
| Papéis e personas trocáveis | `RoleSwitcher`, `RoleGate` "Ver como", `setPersona` | Membership real (F1) |
| Guião, realce, palco dividido | `features/presentation/*`, `data-tour` | Removidos (F1) |
| Menu Demonstração, flags `emptyCompany`/`simulateError` | `DemoMenu`, `ModuleGuard`, `SettingsPage` | Removidos; estados reais de vazio/erro das queries (F1–F6) |
| Offline simulado + atraso falso de 550 ms | `operations.ts` (`syncOutbox`), `setOnline` | Idempotência real (F4), offline real (F7) |
| Ficheiro fictício nos documentos | `shared/DocumentDialog.tsx` | Upload real para S3 (F5) |
| Fotos no IndexedDB | `lib/photos/photoStore.ts` | Storage S3 (F5) |
| Toasts falsos | `features/design/DesignPage.tsx` | Página só em desenvolvimento (F1) |
| Ids e nomes fixos (`m1`, `t4`, "Marta Albuquerque"…) | `presentation/scenario.ts`, `NewSitePage` (`directorId 'm1'`) | Removidos com o guião; diretor escolhido da lista real (F2) |
| Regras fixas: 8 h/9 h nos códigos de atividade, +50 % no custo das extra, pausa de 60 min fixa, stock baixo < 5, aviso a 30 dias, países `PT/FR/BE/DE` | `weeklyMap.ts:141`, `ReportsPage`, `EntryDialogs`, `EquipmentPage`, `DocumentsPage:91`, `GeoMapPage:25` | Política e definições por empresa (F4–F6) |
| Anular = cópia da base de dados inteira | `store/api.ts` `pushUndo` | Change-sets (F3) |

**Mantém-se:** design tokens, textos (`src/copy`, `labels.ts`), enums de apresentação, sugestões de formulário (`CITY_PRESETS`), fixtures de teste.

## Funcionalidades anunciadas sem implementação (backlog)

Upload real de documentos (F5), offline real (F7), permissões (F1), notificações fora da app (email em F5), arquivar entidades (F2+), gestão de clientes/tipos de documento/catálogo de equipamento (F2/F5), reposição de stock (F5), edição completa de obra/equipa/viatura (F2/F3), pedido de ausência em nome do trabalhador (F5), convites e utilizadores (F1), multiempresa (F1).
Fora do âmbito por agora: blocos 2–7 da spec Lyrical (diário de obra, alojamento, agenda, livro de RH, ficha de EPI, integrações Google/OneDrive).
