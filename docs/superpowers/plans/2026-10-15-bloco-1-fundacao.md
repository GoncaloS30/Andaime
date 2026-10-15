# Bloco 1 — Fundação (3.1 scaffold · 3.2 domínio · 3.3 dados e store)

> **Para agentes:** usar superpowers:executing-plans. TDD obrigatório em `src/domain` e `src/store`.

**Objetivo:** base técnica sobre a qual todos os módulos assentam: tooling, tokens, funções de domínio puras e testadas, semente determinística e store única.
**Spec:** `docs/superpowers/specs/2026-10-15-andaime-v3-design.md`

## Restrições globais
- TypeScript `strict`. Sem `any` explícito fora de testes.
- Datas como `ISODate = 'YYYY-MM-DD'`, horas como `'HH:MM'`. Aritmética de datas em UTC (sem fuso).
- Texto da interface em pt-PT; glossário: Obra, Trabalhador, Equipa, Viatura, Limite de horas, Planeadas, Realizadas, Aprovadas, Saldo, Projeção.
- Nenhum dado real do Lyrical (nomes, telefones). Todos os dados são gerados.
- Domínio sem React nem Zustand.

## Decisão revista durante o desenho
`VehicleBooking` deixa de ser entidade: a viatura de um dia é `Assignment.vehicleId`. Reserva, dupla reserva e lotação derivam das atribuições (uma só fonte de verdade). O ADR-0003 é atualizado.

## Tarefas

### T1 — Scaffold e tooling (3.1)
Ficheiros: `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `playwright.config.ts`, `index.html`, `src/main.tsx`, `src/styles/index.css`, `src/test/setup.ts`, `public/_redirects`, `vercel.json`.
Aceitação: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` passam com uma app mínima.

### T2 — `domain/weeks.ts`
Produz: `addDays(d, n)`, `weekStart(d)`, `weekDays(ws)`, `isoWeek(d)`, `isWeekend(d)`, `eachDay(a, b)`, `diffDays(a, b)`, `weekLabel(ws)`, `dayShort(d)`.
Testes: segunda-feira de qualquer dia (inclui domingo), ISO 53 (2026-12-31 → semana 53), viragem de ano, `eachDay` inclusivo.

### T3 — `domain/hours.ts`
Produz: `toMinutes('HH:MM')`, `fromMinutes(n)`, `workedMinutes(entry, nowHHMM?)`, `splitHours(date, hours, dailyNormal)`, `entryHours(entry, settings, now?)`.
Testes: 08:00–17:00 com 60 min → 8 h normais; 07:30–18:30 → 8 + 2 extra; sábado → tudo extra; pausa em curso; saída antes da entrada → 0 (inválido).

### T4 — `domain/siteMetrics.ts`
Produz: `siteMetrics(site, assignments, entries, today, settings)` → `{ limit, realized, approved, plannedFuture, balance, projection, pctRealized, pctProjection, status }`.
Testes: rejeitadas e abertas não contam; planeadas só de hoje em diante e sem entrada; baseline histórica somada; estados normal/atencao/excede/sem_limite nos limiares 85 % e 100 %.

### T5 — `domain/availability.ts`
Produz: `availability(worker, date, ctx)` → `{ state: 'livre'|'parcial'|'atribuido'|'ausente'|'inativo', plannedHours, capacity, absence? }`.
Testes: ausência aprovada total; parcial reduz capacidade; pedido pendente não conta; inativo.

### T6 — `domain/conflicts.ts`
Produz: `detectConflicts(db, range, today)` → `Conflict[]` com `fixes: Fix[]`; `Fix.kind ∈ remove_assignment | reduce_hours | replace_worker | swap_vehicle | set_foreman | raise_limit | open_document | open_site`.
Testes: um por tipo (9 tipos) + ids estáveis + cada fix com payload válido.

### T7 — `domain/weeklyMap.ts`
Produz: `buildWeeklyMap(db, weekStart, filters)` → grupos equipa×obra com dias, trabalhadores, viatura, horário, notas; `buildTimesheetRows(db, weekStart, filters, settings)` → linhas por trabalhador/dia com código de atividade.

### T8 — `data/seed` (3.3)
Produz: `createSeed({ today, seed })` → `DB` determinístico com 42 trabalhadores, 8 equipas, 10 viaturas, 9 obras (8 ativas + 1 planeada), histórico de 4 semanas, 7 conflitos plantados.
Testes: determinismo (mesma semente → mesmo JSON), contagens, conflitos plantados detetados, persona trabalhador sem entrada hoje.

### T9 — Store (3.3)
Produz: `createDemoStore(opts)` (vanilla), `useDemo(selector)`, ações por slice (ver spec §9), `selectors/*`, persistência versionada, atividade, notificações, undo do planeamento, outbox.
Testes: cada ação altera `db` e regista atividade; fluxos 1–9 ao nível da store.
