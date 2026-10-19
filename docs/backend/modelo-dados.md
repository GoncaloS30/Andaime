# Modelo de dados (PostgreSQL 18)

O DDL efetivo vive nas migrações Flyway em `backend/src/main/resources/db/migration`. Este documento é o desenho de referência; cada fase transforma a sua parte em migrações versionadas.

## Convenções

- `id uuid PRIMARY KEY DEFAULT uuidv7()` (ordenável no tempo, bom para índices).
- Tabelas de tenant: `organization_id uuid NOT NULL`, `UNIQUE (organization_id, id)`, RLS ativa e forçada.
- **FKs compostas** entre tabelas de tenant: `FOREIGN KEY (organization_id, x_id) REFERENCES x (organization_id, id)`.
- `created_at`, `updated_at timestamptz NOT NULL DEFAULT now()`; `version integer NOT NULL DEFAULT 0` (optimistic locking).
- Durações em **minutos inteiros**; dinheiro em `numeric(12,2)` + moeda da organização.
- Autores, aprovadores e decisores como `*_user_id` (nunca nomes).
- Não se apaga dados operacionais: `archived_at timestamptz` (trabalhadores, obras, equipas, viaturas, itens). Apagar fisicamente só pela política de retenção/anonimização.
- Unicidade "por organização" sempre com `organization_id` à cabeça do índice.
- Extensões: `btree_gist` (exclusion constraints), `citext` (emails).

## Identidade e organização (F1)

| Tabela | Colunas principais | Constraints / índices |
|---|---|---|
| `users` | email citext, password_hash, display_name, email_verified_at, status (`ACTIVE`/`DISABLED`), locale, last_active_org_id | `UNIQUE(email)` — sem RLS |
| `platform_admins` | user_id, granted_at | PK user_id — sem RLS |
| `organizations` | name, legal_name, tax_id, country (ISO-3166 alfa-2), default_timezone (IANA), currency, status (`ACTIVE`/`SUSPENDED`), version | RLS por `id = app.current_org_id()` |
| `memberships` | organization_id, user_id, role (`OWNER`/`ADMIN`/`MANAGER`/`FOREMAN`/`WORKER`), status (`ACTIVE`/`DISABLED`), employee_id (F2), version | `UNIQUE(organization_id, user_id)`; RLS por org **ou** `user_id = app.current_user_id()` (para listar as minhas orgs) |
| `invitations` | organization_id, email, role, token_hash bytea, expires_at, accepted_at, revoked_at, invited_by_user_id | `UNIQUE(token_hash)`; único pendente por `(organization_id, email)` |
| `email_verification_tokens`, `password_reset_tokens` | user_id, token_hash, expires_at, used_at | `UNIQUE(token_hash)` — sem RLS |
| `login_throttle` | key (email normalizado), failures, locked_until, last_failure_at | sem RLS |
| `support_access_grants` | organization_id, platform_user_id, reason, expires_at, revoked_at | RLS |
| `spring_session`, `spring_session_attributes` | esquema padrão do Spring Session JDBC | sem RLS |

## Política (F1 estrutura, F4 cálculo)

| Tabela | Colunas | Notas |
|---|---|---|
| `labor_policies` | organization_id, country (null = omissão da empresa), effective daterange, daily_normal_min, weekly_normal_min, rest_days smallint[] (ISO 1–7), holidays_are_rest, auto_break_after_min, auto_break_min, overnight_attribution (`START_DAY`/`SPLIT_MIDNIGHT`), overtime_tiers jsonb (`[{"upToMin":60,"code":"801"},{"code":"802"}]`), normal_code | `EXCLUDE (organization_id =, coalesce(country,'*') =, effective &&)` |
| `public_holidays` | country, region, date, name | global (sem org) |
| `org_holidays` | organization_id, date, name, country | RLS |
| `conflict_rule_settings` | organization_id, rule, severity (`BLOCK`/`WARN`/`OFF`) | PK (organization_id, rule) |

## Trabalhadores e equipas (F2)

| Tabela | Colunas | Constraints |
|---|---|---|
| `employees` | number, full_name, category, phone, email, nationality, home_city, hire_date, status, daily_capacity_min, hourly_cost, sizes jsonb, user_id (opcional), photo_key, archived_at | `UNIQUE(organization_id, number)` |
| `employee_contracts` | employee_id, kind, start_date, end_date, weekly_min, notes | sem sobreposição por trabalhador |
| `employee_skills` | employee_id, skill, level, valid_until | `UNIQUE(organization_id, employee_id, skill)` |
| `teams` | name, color, foreman_employee_id, archived_at | `UNIQUE(organization_id, lower(name))` onde não arquivada |
| `team_members` | team_id, employee_id, valid daterange | `EXCLUDE (organization_id =, employee_id =, valid &&)` — histórico de composição preservado |

## Obras (F2)

| Tabela | Colunas | Constraints |
|---|---|---|
| `clients` | name, tax_id, contact_name, email, country | `UNIQUE(organization_id, tax_id)` |
| `sites` | code, name, client_id, country, city, address, lat, lng, timezone (IANA validado), status (`PLANNED`/`ACTIVE`/`SUSPENDED`/`DONE`), start_date, end_date, hour_limit_min, baseline_realized_min, baseline_approved_min, director_user_id, foreman_employee_id, color, description, erp_order, photo_key, archived_at | `UNIQUE(organization_id, code)`; `CHECK end_date >= start_date` |
| `site_issues` | site_id, reported_by_user_id, category, text, status, resolved_at | |
| `week_notes` | week_start date, text | `UNIQUE(organization_id, week_start)` |

## Frota (F3)

| Tabela | Colunas | Constraints |
|---|---|---|
| `vehicles` | plate, make, model, seats, status (`OPERATIONAL`/`WORKSHOP`/`INACTIVE`), km, insurance_until, inspection_until, maintenance_due, notes, photo_key, archived_at | `UNIQUE(organization_id, plate)`; `CHECK seats > 0` |
| `vehicle_unavailability` | vehicle_id, period daterange, reason | |
| `team_vehicle_links` | team_id, vehicle_id, valid daterange | sem sobreposição por viatura e por equipa |

## Planeamento (F3)

| Tabela | Colunas | Constraints |
|---|---|---|
| `assignments` | employee_id, site_id, work_date, start_time, end_time, break_min, planned_min, site_tz, period tstzrange (trigger), team_id, vehicle_id, is_foreman, note, batch_id, version | `EXCLUDE USING gist (organization_id WITH =, employee_id WITH =, period WITH &&) DEFERRABLE INITIALLY DEFERRED`; `EXCLUDE USING gist (organization_id WITH =, vehicle_id WITH =, period WITH &&, site_id WITH <>) WHERE (vehicle_id IS NOT NULL) DEFERRABLE INITIALLY DEFERRED`; índices `(organization_id, work_date)`, `(organization_id, site_id, work_date)` |
| `change_sets` | actor_user_id, kind, label, created_at, reverted_by_change_set_id | |
| `change_set_items` | change_set_id, entity_type, entity_id, op, before jsonb, after jsonb, after_version | |

## Horas e aprovações (F4)

| Tabela | Colunas | Constraints |
|---|---|---|
| `clock_events` | employee_id, kind (`IN`/`OUT`/`BREAK_START`/`BREAK_END`), device_time, server_time, zone, site_id, idempotency_key | só acrescento; `UNIQUE(organization_id, employee_id, idempotency_key)` |
| `time_entries` | employee_id, site_id, clock_in, clock_out, zone, work_date, period (gerado), source (`CLOCK`/`MANUAL`/`FOREMAN`), voided, timesheet_id, review_mark, version | `EXCLUDE (organization_id =, employee_id =, period &&) WHERE (NOT voided)`; um aberto por trabalhador; `CHECK clock_out > clock_in` |
| `time_entry_breaks` | time_entry_id, start_at, end_at | sem sobreposição; dentro do registo (trigger) |
| `time_entry_revisions` | time_entry_id, revision_no, snapshot jsonb, changed_by_user_id, reason, at | só acrescento |
| `timesheets` | employee_id, iso_year, iso_week, status (`DRAFT`/`SUBMITTED`/`UNDER_REVIEW`/`APPROVED`/`REJECTED`/`CORRECTED`), totals jsonb, version | `UNIQUE(organization_id, employee_id, iso_year, iso_week)` |
| `timesheet_approvals` | timesheet_id, from_status, to_status, actor_user_id, note, at | só acrescento |

Trigger: `UPDATE`/`DELETE`/`INSERT` em `time_entries`/`time_entry_breaks` associados a uma folha `APPROVED` → exceção. Reabrir é uma transição auditada.

## Ausências (F5)

`absences`: employee_id, type (`VACATION`/`JUSTIFIED`/`UNJUSTIFIED`/`SICK`/`TRAINING`/`PARTIAL`), period daterange, partial_min_per_day, status (`REQUESTED`/`APPROVED`/`REJECTED`/`CANCELLED`), reason, requested_by_user_id, decided_by_user_id, decided_at, decision_note, version. `CHECK ((type = 'PARTIAL') = (partial_min_per_day IS NOT NULL))`; `EXCLUDE (organization_id =, employee_id =, period &&) WHERE (status IN ('REQUESTED','APPROVED') AND type <> 'PARTIAL')`. Cancelar muda o estado (nunca apaga).

## Documentos (F5)

| Tabela | Colunas |
|---|---|
| `document_type_templates` | catálogo global (A1, Carte BTP, Limosa, Meldung, SIPSI, PSS, aptidão médica, SST…) copiado no onboarding |
| `document_types` | name, short, applies_to (`EMPLOYEE`/`SITE`/`COMPANY`), validity_months, description |
| `document_requirements` | document_type_id, country (null = todos), mandatory |
| `documents` | document_type_id, owner_kind, employee_id, site_id (exatamente um ou nenhum para empresa — CHECK), number |
| `document_versions` | document_id, version, storage_key, sha256, size_bytes, mime_type, original_filename, issued_at, expires_at, verification (`PENDING`/`VERIFIED`/`REJECTED`), verified_by_user_id, uploaded_by_user_id, scan_status — `UNIQUE(document_id, version)` |

## Equipamentos (F5)

`equipment_items` (name, kind, size_kind, tracking `STOCK`/`SERIALIZED`, low_stock_threshold), `equipment_units` (serial `UNIQUE(organization_id, item_id, serial)`, holder_employee_id), `stock_balances` (item_id, size, on_hand `CHECK >= 0`), `equipment_movements` (kind `RECEIVE`/`ISSUE`/`RETURN`/`DAMAGED`/`LOST`/`ADJUST`, qty, unit_id, employee_id, actor_user_id, reason — só acrescento). Uma unidade com série só pode ter um titular.

## Transversal

| Tabela | Notas |
|---|---|
| `audit_event` (F1) | organization_id (nullable para eventos de plataforma/autenticação), occurred_at, actor_user_id, actor_role, on_behalf, action, entity_type, entity_id, changes jsonb (diff mínimo, sem dados pessoais sensíveis), request_id, ip. `UPDATE`/`DELETE` revogados e bloqueados por trigger. Índices `(organization_id, occurred_at desc)`, `(organization_id, entity_type, entity_id)` |
| `event_publication` (F1) | outbox do Spring Modulith |
| `idempotency_keys` (F1) | organization_id, user_id, key, request_hash, response_status, response_body, expires_at — `UNIQUE(organization_id, user_id, key)` |
| `notifications` (F5) | recipient_user_id, kind, params jsonb, link, read_at |

## Retenção (a validar juridicamente)

- Registos de horas e aprovações: prazo legal configurável por empresa (omissão: 5 anos).
- Ex-trabalhadores: anonimização de contactos, nacionalidade, tamanhos e fotos após o prazo configurado; mantêm-se número e horas para obrigações legais.
- `audit_event`: particionável por mês; retenção configurável.
- Documentos: versões antigas apagadas do storage após o prazo; metadados mantidos.
