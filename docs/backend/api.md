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
| 401 | `unauthenticated` |
| 403 | `forbidden`, `csrf` |
| 404 | `not-found` (inclui recursos de outra empresa) |
| 409 | `stale`, `conflict`, `planning-conflicts`, `confirmation-required`, `last-owner`, `already-member`, `insufficient-stock` |
| 429 | `rate-limited` (com `Retry-After`) |

## F1 — Identidade e organizações

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
| GET | `/api/invitations/{token}` | público | `{orgName, role, emailMasked, expiresAt}` |
| POST | `/api/invitations/{token}/accept` | sessão | O email da sessão tem de coincidir com o do convite |
| GET | `/api/orgs/{orgId}/audit` | ADMIN+ | Eventos de auditoria paginados |
| GET | `/api/platform/orgs` | PLATFORM_ADMIN | Lista de organizações |
| POST | `/api/platform/orgs/{id}/suspend` · `/reactivate` | PLATFORM_ADMIN | Suspende/reativa |

Só OWNER pode atribuir ou retirar OWNER/ADMIN. O último OWNER ativo não pode ser despromovido nem desativado.

## F2–F6 (planeado)

Ver `docs/backend/arquitetura.md` (Ecrã → API) e o plano aprovado. Cada fase acrescenta aqui a sua tabela quando é implementada.
