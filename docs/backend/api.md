# API — convenções e contratos

O contrato vivo é o OpenAPI gerado pelo backend: `http://localhost:8088/api/docs` (JSON) e `/api/docs/ui` (Swagger UI, só no perfil `local`).

## Convenções

- Base `/api`. Recursos de empresa em `/api/orgs/{orgId}/…`. Ids são UUID.
- JSON com `camelCase`; datas `YYYY-MM-DD`; instantes ISO-8601 com `Z`; horas locais `HH:mm`; **durações em minutos**.
- Listas paginadas: `?page=0&size=50&sort=name,asc` → `{ "items": [...], "page": 0, "size": 50, "total": 123 }`. `size` máximo 200.
- Concorrência: recursos editáveis têm `version`; `PATCH`/transições exigem `version` e respondem **409 `stale`** se mudou.
- Idempotência: `POST` aceita `Idempotency-Key` (UUID). Ponto e transições de workflow são idempotentes por natureza.
- Mutações exigem o cabeçalho `X-XSRF-TOKEN` (valor do cookie `XSRF-TOKEN`; obtido com `GET /api/auth/csrf`).
- Erros em `application/problem+json` (RFC 9457):

```json
{ "type": "https://andaime.app/problems/validation", "title": "Dados inválidos", "status": 400,
  "code": "validation", "detail": "…", "errors": [{ "field": "email", "code": "Email", "message": "Email inválido" }],
  "requestId": "…" }
```

| Status | `code` |
|---|---|
| 400 | `validation`, `bad-request` |
| 401 | `unauthenticated`, `session-expired` |
| 403 | `forbidden`, `csrf`, `organization-suspended`, `invitation-email-mismatch` |
| 404 | `not-found` (inclui recursos de outra empresa) |
| 409 | `stale`, `conflict`, `planning-conflicts`, `confirmation-required`, `last-owner`, `already-member`, `insufficient-stock` |
| 429 | `rate-limited` (com `Retry-After`) |

## F1 — Identidade e organizações

Implementado na íntegra (F1 concluída). Todas as rotas `/api/orgs/{orgId}/…` passam pelo filtro de membership: quem não é membro recebe 404; empresa suspensa → 403 `organization-suspended`.

| Método | Caminho | Quem | Descrição |
|---|---|---|---|
| GET | `/api/auth/csrf` | público | Emite o cookie `XSRF-TOKEN` |
| POST | `/api/auth/signup` | público | `{email, password, displayName}` → 202; envia email de verificação |
| POST | `/api/auth/verify-email` | público | `{token}` → 204 |
| POST | `/api/auth/login` | público | `{email, password}` → `Me`; cria sessão |
| POST | `/api/auth/logout` | sessão | 204 |
| POST | `/api/auth/password/forgot` | público | `{email}` → sempre 202 |
| POST | `/api/auth/password/reset` | público | `{token, password}` → 204; termina todas as sessões |
| POST | `/api/auth/password/change` | sessão | `{currentPassword, newPassword}` → 204; termina as outras sessões |
| GET | `/api/me` | sessão | `{user, memberships:[{orgId, orgName, role}], activeOrgId, platformAdmin}` |
| PATCH | `/api/me` | sessão | `{displayName, locale}` |
| PUT | `/api/me/active-org` | sessão | `{orgId}` (só preferência) |
| GET | `/api/me/sessions` | sessão | Sessões ativas |
| DELETE | `/api/me/sessions/{id}` | sessão | Termina uma sessão |
| POST | `/api/orgs` | sessão | Onboarding `{name, legalName?, taxId?, country, timezone?}` → `Organization`; criador fica OWNER |
| GET | `/api/orgs/{orgId}` | membro | Organização |
| PATCH | `/api/orgs/{orgId}` | ADMIN+ | `{name, legalName, taxId, timezone, version}` |
| GET | `/api/orgs/{orgId}/members` | MANAGER+ | Membros |
| PATCH | `/api/orgs/{orgId}/members/{membershipId}` | ADMIN+ | `{role, version}` |
| DELETE | `/api/orgs/{orgId}/members/{membershipId}` | ADMIN+ | Desativa (204) |
| GET | `/api/orgs/{orgId}/invitations` | ADMIN+ | Convites pendentes |
| POST | `/api/orgs/{orgId}/invitations` | ADMIN+ | `{email, role}` → envia email |
| DELETE | `/api/orgs/{orgId}/invitations/{id}` | ADMIN+ | Revoga |
| POST | `/api/orgs/{orgId}/invitations/{id}/resend` | ADMIN+ | Novo token, reenvia |
| GET | `/api/invitations/{token}` | público | `{organizationName, role, emailMasked, expiresAt, status}` (`VALID`, `EXPIRED`, `ACCEPTED`, `REVOKED`, `SUSPENDED`) |
| POST | `/api/invitations/{token}/accept` | sessão | O email da sessão tem de coincidir com o do convite (403 `invitation-email-mismatch`); convite já usado ou expirado → 409 `invitation-invalid` |
| GET | `/api/orgs/{orgId}/audit` | ADMIN+ | Eventos de auditoria paginados |
| GET | `/api/platform/orgs` | PLATFORM_ADMIN | Lista de organizações |
| POST | `/api/platform/orgs/{id}/suspend` · `/reactivate` | PLATFORM_ADMIN | Suspende/reativa |

Só OWNER pode atribuir ou retirar OWNER/ADMIN. O último OWNER ativo não pode ser despromovido nem desativado.

## F2 — Trabalhadores, equipas, obras, clientes e ocorrências

Todas sob `/api/orgs/{orgId}`. Gestor = OWNER, ADMIN ou MANAGER. O encarregado tem leitura limitada ao seu âmbito; o trabalhador só a sua ficha.

| Método | Caminho | Quem | Descrição |
|---|---|---|---|
| GET | `/employees?q&status&team&category&archived&page&size` | todos (âmbito) | Página `{items, page, size, total}`; `team=none` para sem equipa |
| GET | `/employees/{id}` | todos (âmbito) | Ficha; `restricted: true` e campos pessoais/custo a `null` para encarregados |
| POST · PATCH | `/employees` · `/employees/{id}` | gestor | `{number?, fullName, category, phone, email, nationality, homeCity, hireDate, status, dailyCapacityMin, hourlyCost, skills[], sizes{}, notes, version}`; 409 `number-taken`, `stale` |
| POST | `/employees/{id}/archive` · `/restore` | gestor | Arquivar sai das equipas a partir de hoje; 409 `employee-is-foreman` |
| GET | `/employees/{id}/teams` | todos (âmbito) | Percurso em equipas |
| GET · POST · DELETE | `/employees/{id}/contracts[/{contractId}]` | gestor | 409 `overlap` |
| GET | `/teams?archived` · `/teams/{id}` | gestor, encarregado (as suas) | Membros atuais e composição ao longo do tempo |
| POST · PATCH | `/teams` · `/teams/{id}` | gestor | `{name, color, foremanEmployeeId, version}`; 409 `name-taken` |
| POST | `/teams/{id}/members` | gestor | `{employeeId, joinedOn}` (hoje ou futuro; 400 `past-date`) |
| POST | `/teams/{id}/members/{employeeId}/leave` | gestor | `{lastDay}` |
| POST | `/teams/{id}/archive` | gestor | |
| GET | `/sites?q&status&country&archived` · `/sites/{id}` | gestor, encarregado (as suas) | Inclui `metrics` em minutos e `includesTimeEntries` |
| GET | `/sites/next-code` | gestor | Próximo código `OB-AA-NNN` |
| POST · PATCH | `/sites` · `/sites/{id}` | gestor | Substituição completa com `version`; 409 `code-taken`; 400 `invalid-timezone`, `invalid-director` |
| POST | `/sites/{id}/archive` · `/restore` | gestor | |
| GET · POST | `/sites/{id}/issues` | encarregado+ (âmbito) | `{category: SAFETY|MATERIAL|EQUIPMENT|ACCESS|OTHER, description}` |
| GET | `/issues?status` | encarregado+ (âmbito) | |
| POST | `/issues/{id}/resolve` | encarregado+ (âmbito) | `{note}`; 409 `already-resolved` |
| GET · POST · PATCH | `/clients` · `/clients/{id}` | gestor | 409 `tax-id-taken` |
| PUT | `/members/{membershipId}/employee` | ADMIN+ | `{employeeId | null}`; 409 `employee-linked` |
| GET | `/audit?entityType&entityId` | gestor | Histórico de um registo |

## F3 — Planeamento e viaturas

Todas sob `/api/orgs/{orgId}`. Horas locais da obra (`HH:mm`), durações em minutos.

| Método | Caminho | Quem | Descrição |
|---|---|---|---|
| GET | `/planning/board?from&to` | todos (âmbito) | `{assignments, conflicts, readOnly}`; máximo 92 dias. Gestor vê tudo e os conflitos; encarregado as suas equipas/obras; trabalhador as suas atribuições |
| GET | `/planning/conflicts?from&to` | gestor | Conflitos com `severity` (BLOCK/WARN), explicação e `fixes` |
| POST | `/planning/preview` | gestor | Corre o comando e desfaz: `{created, updated, deleted, skipped[], newConflicts[]}` |
| POST | `/planning/commands` | gestor | `{kind, …, acknowledgedConflictIds[]}`; 409 `planning-conflicts` (bloqueantes) ou `confirmation-required` (avisos a confirmar), ambos com `conflicts[]`; 409 `stale` |
| GET | `/planning/change-sets?limit` | gestor | Últimas alterações do próprio, com `canRevert` |
| POST | `/planning/change-sets/{id}/revert` | gestor | 409 `stale` (mudou entretanto), `already-reverted` |
| GET | `/vehicles?q&status&archived` · `/vehicles/{id}` | encarregado+ | Alertas a 30 dias; ficha com indisponibilidades e próximas saídas |
| POST · PATCH | `/vehicles` · `/vehicles/{id}` | gestor | `{plate, make, model, seats, status, km, insuranceUntil, inspectionUntil, maintenanceDue, notes, version}`; 409 `plate-taken`, `stale` |
| POST | `/vehicles/{id}/archive` · `/restore` | gestor | Arquivar fecha a ligação à equipa |
| POST · DELETE | `/vehicles/{id}/unavailability[/{uid}]` | gestor | `{startsOn, endsOn, reason}` |
| PUT | `/teams/{teamId}/vehicle` | gestor | `{vehicleId | null, from?}` (hoje ou futuro) |

Tipos de comando: `ASSIGN`, `SCHEDULE` (várias pessoas × dias da semana), `UPDATE`, `BULK_UPDATE`, `DUPLICATE`, `DELETE`, `TRANSFER`, `COPY_WEEK` (ignora dias passados, pessoas inativas e dias já planeados e devolve-os em `skipped`). Máximo de 500 atribuições por comando.

## F4 — Horas e aprovações

Todas sob `/api/orgs/{orgId}`. Instantes em ISO UTC; horas locais da obra; minutos.

| Método | Caminho | Quem | Descrição |
|---|---|---|---|
| GET | `/me/clock` | trabalhador com ficha | `{open, today[], weekWorkedMin, weekOvertimeMin}`; 409 `no-employee` sem ficha ligada |
| POST | `/me/clock/{in, break-start, break-end, out}` | trabalhador com ficha | `{idempotencyKey, deviceTime?, siteId?}`; repetir a chave não duplica; 409 `already-clocked-in`, `not-clocked-in`, `already-on-break`, `not-on-break`, `entry-too-long`; 400 `site-required` |
| GET | `/time-entries?from&to&employeeId&siteId` | todos (âmbito) | Máximo 62 dias |
| GET | `/time-entries/planned?date` | encarregado+ | Planeado do dia com `confirmed` |
| POST | `/time-entries` | encarregado+ (âmbito) | Manual `{employeeId, siteId, date, start, end, breakMin?, note?, reason}`; 400 `future-date`; 409 `overlap`, `timesheet-locked` |
| POST | `/time-entries/confirm-planned` | encarregado+ | `{assignmentIds[]}` → `{created, skippedAssignmentIds}` |
| PATCH | `/time-entries/{id}` | encarregado+ (âmbito) | Correção `{siteId?, date?, start?, end?, breakMin?, note?, reason, version}`; 409 `stale`, `timesheet-locked` |
| POST | `/time-entries/{id}/cancel` | encarregado+ (âmbito) | `{reason, version}` |
| GET | `/time-entries/{id}/revisions` | encarregado+ (âmbito) | Original e correções com motivo |
| GET | `/timesheets?week&status` | todos (âmbito) | Resumo por trabalhador: planeadas, trabalhadas, normais, extra, estado, alertas |
| GET | `/timesheets/{employeeId}/{week}` | todos (âmbito) | Dias com registos |
| POST | `/timesheets/{employeeId}/{week}/{submit, approve, reject, reopen}` | submit: o próprio, encarregado ou gestor; restantes: gestor | `{note?, version?}`; reject e reopen exigem nota; 409 `invalid-transition`, `open-entries`, `stale` |

## F5 — Documentos, ausências, equipamentos e notificações

Todas sob `/api/orgs/{orgId}`.

| Método | Caminho | Quem | Descrição |
|---|---|---|---|
| GET · POST · PATCH | `/document-types[/{id}]` | ver: todos; alterar: gestor | `{name, subject: EMPLOYEE, VEHICLE, requiresExpiry, alertDays}`; 409 `name-taken` |
| PUT | `/document-types/{id}/requirements` | gestor | `{everywhere, countries[]}` |
| GET | `/documents?employeeId&vehicleId&typeId&status&archived` | todos (âmbito) | Situação `VALID`, `EXPIRING`, `EXPIRED` |
| POST | `/documents` (multipart) | trabalhador (o próprio), encarregado (equipa), gestor | `typeId, employeeId ou vehicleId, issuedOn?, expiresOn?, file`; 415 `file-type`; 413 `file-too-large` |
| GET | `/documents/{id}` · `/documents/compliance?country` | âmbito · encarregado+ | Versões; conformidade por trabalhador |
| GET | `/documents/{id}/versions/{versionId}/download` | âmbito | Ficheiro (`attachment`, `nosniff`, sem cache); auditado |
| POST | `/documents/{id}/versions/{versionId}/verify` · `/documents/{id}/archive` | gestor | |
| GET · POST | `/absences?from&to&status&employeeId` | âmbito | Pedido `{employeeId?, kind, startsOn, endsOn, partialMinutes?, note?}`; 409 `overlap` |
| GET | `/absences/{id}/impact` | âmbito | Atribuições afetadas |
| POST | `/absences/{id}/approve` | gestor | `{resolution: REMOVE, KEEP, version}`; 409 `resolution-required` com `assignments` |
| POST | `/absences/{id}/reject` · `/cancel` | gestor · o próprio/encarregado (pedidas), gestor (aprovadas) | reject exige `note` |
| GET · POST · PATCH | `/equipment/items[/{id}]` | ver: encarregado+; alterar: gestor | `{name, category: PPE, UNIFORM, TOOL, tracking: STOCK, SERIAL, size, minStock}` |
| POST | `/equipment/receive` · `/items/{id}/adjust` · `/deliver` · `/return` | gestor | 409 `insufficient-stock`, `serial-taken`, `unit-unavailable`, `not-held` |
| GET | `/equipment/holdings/{employeeId}` · `/movements` · `/items/{id}/units` | âmbito · gestor · encarregado+ | |
| GET · POST | `/notifications` · `/notifications/read` | o próprio | `{unread, items}`; `{ids[]}` vazio = todas |
| GET | `/notifications/stream` | o próprio | SSE: evento `changed` |

## F6 (planeado)

Ver `docs/backend/arquitetura.md` (Ecrã → API) e o plano aprovado. Cada fase acrescenta aqui a sua tabela quando é implementada.
