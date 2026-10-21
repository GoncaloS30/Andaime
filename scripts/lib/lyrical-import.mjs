import { randomUUID } from 'node:crypto';

export const TEAM_COLORS = ['#2a78d6', '#d4652f', '#1a9e72', '#8a4fc7', '#c0457f', '#3f8a2a'];
export const SITE_COLORS = ['#2a78d6', '#1a9e72', '#d4652f', '#8a4fc7', '#2196a8', '#c0457f'];

// O PostgreSQL recusa o carácter nulo em texto; nunca tem significado nos dados do Lyrical.
const clean = (value) => (value == null ? '' : String(value)).replaceAll('\u0000', '');

const text = (value, max) => {
  const normalized = clean(value).trim();
  return normalized ? normalized.slice(0, max) : null;
};

const asciiCode = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export function uniqueCode(value, fallback, maxLength, used) {
  const base = (asciiCode(value) || fallback).slice(0, maxLength).replace(/-+$/g, '') || fallback;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const marker = `-${suffix++}`;
    candidate = `${base.slice(0, maxLength - marker.length).replace(/-+$/g, '')}${marker}`;
  }
  used.add(candidate);
  return candidate;
}

export function mapEmployee(row, usedNumbers = new Set()) {
  const id = Number(row.id);
  const number = uniqueCode(row.numero_mecanografico, `LEGACY-${id}`, 20, usedNumbers);
  const sizes = Object.fromEntries([
    ['tshirt', row.tamanho_tshirt],
    ['sweat', row.tamanho_sweat],
    ['calcas', row.tamanho_calcas],
    ['botas', row.tamanho_botas],
    ['parka', row.tamanho_parka]
  ].map(([key, value]) => [key, text(value, 10)]).filter(([, value]) => value));
  return {
    legacyId: id,
    id: randomUUID(),
    number,
    fullName: text(row.nome, 160) || `Colaborador legado ${id}`,
    category: text(row.categoria, 60) || 'Sem categoria',
    phone: text(row.contacto, 40),
    sizes
  };
}

const validIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''));

export function mapSite(row, index, today = new Date().toISOString().slice(0, 10), usedCodes = new Set()) {
  const legacyId = Number(row.id);
  const code = uniqueCode(row.codigo_pep, `LEGACY-${legacyId}`, 20, usedCodes);
  const startDate = validIsoDate(row.data_inicio) ? row.data_inicio : null;
  const candidateEnd = validIsoDate(row.data_fim)
    ? row.data_fim
    : (validIsoDate(row.data_previsao_fim) ? row.data_previsao_fim : null);
  const endDate = startDate && candidateEnd && candidateEnd < startDate ? null : candidateEnd;
  const status = startDate && startDate > today ? 'PLANNED' : (endDate && endDate < today ? 'DONE' : 'ACTIVE');
  const limit = Number(row.limite_horas);
  const latitude = row.latitude == null ? null : Number(row.latitude);
  const longitude = row.longitude == null ? null : Number(row.longitude);
  const validCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  return {
    legacyId,
    id: randomUUID(),
    code,
    name: text(row.descricao, 160) || code,
    country: 'PT',
    address: text(row.morada, 300),
    latitude: validCoordinates ? latitude : null,
    longitude: validCoordinates ? longitude : null,
    timezone: 'Europe/Lisbon',
    status,
    startDate,
    endDate,
    hourLimitMin: Number.isFinite(limit) && limit > 0 ? Math.round(limit * 60) : null,
    color: SITE_COLORS[index % SITE_COLORS.length],
    erpOrder: text(row.ordem, 40)
  };
}

export function selectCurrentTeamMemberships(assignments) {
  const byEmployee = new Map();
  for (const assignment of assignments) {
    if (assignment.teamId == null || !validIsoDate(assignment.week)) continue;
    const employeeId = Number(assignment.employeeId);
    const current = byEmployee.get(employeeId);
    if (!current || assignment.week > current.week) {
      byEmployee.set(employeeId, { week: assignment.week, rows: [assignment] });
    } else if (assignment.week === current.week) {
      current.rows.push(assignment);
    }
  }

  let ambiguous = 0;
  const memberships = [];
  for (const [employeeId, current] of byEmployee) {
    const teamDays = new Map();
    for (const row of current.rows) {
      const teamId = Number(row.teamId);
      const days = teamDays.get(teamId) || new Set();
      for (const day of String(row.days ?? '12345')) {
        if ('12345'.includes(day)) days.add(day);
      }
      teamDays.set(teamId, days);
    }
    if (teamDays.size > 1) ambiguous += 1;
    const [teamId] = [...teamDays.entries()].sort((a, b) =>
      b[1].size - a[1].size || a[0] - b[0]
    )[0];
    memberships.push({ employeeId, teamId, joinedOn: current.week, alternatives: teamDays.size });
  }
  return { memberships, ambiguous };
}

// --- datas -------------------------------------------------------------------------------------------

/** Data ISO (AAAA-MM-DD) que existe no calendário: "2026-02-30" não passa. */
export function isIsoDate(value) {
  const candidate = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return false;
  const date = new Date(`${candidate}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === candidate;
}

export function addDays(date, days) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Segunda-feira da semana ISO que contém a data. */
export function mondayOf(date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

const trimmed = (value) => clean(value).trim();

function rejection(rejected, table, id, reason) {
  rejected.push({ table, id: Number(id), reason });
}

// --- ausências ---------------------------------------------------------------------------------------

/**
 * Tipos do Lyrical → tipos do Andaime. As férias vêm da tabela `ferias`; o resto de `ausencias.tipo`.
 * Quando o tipo do Andaime é mais largo do que o do Lyrical, a etiqueta original vai para o início da nota.
 */
export const ABSENCE_KIND_MAP = Object.freeze({
  ferias: { kind: 'VACATION' },
  falta_justificada: { kind: 'PERSONAL', label: 'Falta justificada' },
  falta_injustificada: { kind: 'OTHER', label: 'Falta injustificada' },
  baixa: { kind: 'SICK' },
  licenca: { kind: 'LEAVE' },
  formacao: { kind: 'TRAINING' },
  outra: { kind: 'OTHER' }
});

/**
 * Férias e ausências do Lyrical como ausências aprovadas. Datas inválidas, fim antes do início ou períodos acima de
 * 366 dias (limite da tabela) são recusados com motivo. Sobreposições do mesmo trabalhador — que o Andaime proíbe em
 * dias inteiros — resolvem-se como no Lyrical: o dia fica com a primeira ausência (início, origem, id); a seguinte
 * começa no dia depois e, se ficar coberta por inteiro, é recusada.
 */
export function mapAbsences({ vacations = [], absences = [] }, employeeIds) {
  const rejected = [];
  const transformations = { kindLabelInNote: 0, unknownTypes: 0, trimmedOverlaps: 0, notesTruncated: 0 };
  const candidates = [];
  const sources = [
    ...vacations.map((row) => ({ origin: 'ferias', row, type: 'ferias' })),
    ...absences.map((row) => ({ origin: 'ausencias', row, type: trimmed(row.tipo) }))
  ];
  for (const { origin, row, type } of sources) {
    const employeeId = employeeIds.get(Number(row.trabalhador_id));
    const startsOn = trimmed(row.data_inicio);
    const endsOn = trimmed(row.data_fim);
    if (!employeeId) { rejection(rejected, origin, row.id, 'colaborador-inexistente'); continue; }
    if (!isIsoDate(startsOn) || !isIsoDate(endsOn)) { rejection(rejected, origin, row.id, 'data-invalida'); continue; }
    if (endsOn < startsOn) { rejection(rejected, origin, row.id, 'fim-antes-do-inicio'); continue; }
    if (daysBetween(startsOn, endsOn) > 366) { rejection(rejected, origin, row.id, 'periodo-acima-de-366-dias'); continue; }

    let mapping = ABSENCE_KIND_MAP[type];
    let label = mapping?.label ?? null;
    if (!mapping) {
      mapping = { kind: 'OTHER' };
      label = type ? `Tipo no Lyrical: ${type}` : null;
      transformations.unknownTypes += 1;
    } else if (label) {
      transformations.kindLabelInNote += 1;
    }
    let note = [label, text(row.observacoes, 10_000)].filter(Boolean).join(' — ');
    if (note.length > 500) {
      note = `${note.slice(0, 499)}…`;
      transformations.notesTruncated += 1;
    }
    candidates.push({
      origin,
      legacyId: Number(row.id),
      employeeId,
      kind: mapping.kind,
      startsOn,
      endsOn,
      note: note || null
    });
  }

  const byEmployee = new Map();
  for (const candidate of candidates) {
    const list = byEmployee.get(candidate.employeeId) || [];
    list.push(candidate);
    byEmployee.set(candidate.employeeId, list);
  }
  const rows = [];
  for (const list of byEmployee.values()) {
    list.sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.origin.localeCompare(b.origin) || a.legacyId - b.legacyId);
    let lastEnd = null;
    for (const candidate of list) {
      if (lastEnd && candidate.startsOn <= lastEnd) {
        if (candidate.endsOn <= lastEnd) {
          rejection(rejected, candidate.origin, candidate.legacyId, 'coberta-por-outra-ausencia');
          continue;
        }
        candidate.startsOn = addDays(lastEnd, 1);
        transformations.trimmedOverlaps += 1;
      }
      rows.push({ ...candidate, id: randomUUID() });
      lastEnd = candidate.endsOn;
    }
  }
  rows.sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.origin.localeCompare(b.origin) || a.legacyId - b.legacyId);
  return { rows, rejected, transformations };
}

// --- hotéis e dormidas -------------------------------------------------------------------------------

// O `unaccent` do PostgreSQL também desfaz estas letras, que o NFD não decompõe.
const FOLD_EXTRA = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i' };

/** Espelho de `app.fold_name` (V28): sem espaços nas pontas, sem acentos, em minúsculas. */
export function foldName(value) {
  return clean(value).trim().toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[øæœßłđðþı]/g, (letter) => FOLD_EXTRA[letter]);
}

/**
 * Hotéis por obra. Nomes repetidos na mesma obra (sem olhar a acentos, maiúsculas nem espaços repetidos) juntam-se
 * no primeiro, que herda a morada, o contacto e as notas que lhe faltem; as dormidas dos repetidos apontam para ele.
 */
export function mapHotels(rows, siteIds) {
  const hotels = [];
  const byLegacy = new Map();
  const byKey = new Map();
  const rejected = [];
  let merged = 0;
  for (const row of [...rows].sort((a, b) => Number(a.id) - Number(b.id))) {
    const legacyId = Number(row.id);
    const siteId = siteIds.get(Number(row.projeto_id));
    if (!siteId) { rejection(rejected, 'hoteis', legacyId, 'obra-inexistente'); continue; }
    const name = trimmed(row.nome).replace(/\s+/g, ' ').slice(0, 120).trim();
    if (name.length < 2) { rejection(rejected, 'hoteis', legacyId, 'nome-invalido'); continue; }
    const fields = { address: text(row.morada, 300), contact: text(row.contacto, 120), notes: text(row.notas, 1000) };
    const key = `${siteId}:${foldName(name)}`;
    const existing = byKey.get(key);
    if (existing) {
      merged += 1;
      for (const [field, value] of Object.entries(fields)) existing[field] ??= value;
      byLegacy.set(legacyId, existing);
      continue;
    }
    const hotel = { legacyId, id: randomUUID(), siteId, name, ...fields };
    hotels.push(hotel);
    byKey.set(key, hotel);
    byLegacy.set(legacyId, hotel);
  }
  return { hotels, byLegacy, rejected, merged };
}

/**
 * Dormidas → estadias (pessoa × obra × semana). A semana passa a ser a segunda-feira ISO; as restantes regras da
 * tabela `stays` (saída depois da entrada, até 14 noites, entrada entre a segunda anterior e o domingo da semana,
 * uma estadia por pessoa, obra e semana) recusam a linha com motivo em vez de mexer nas datas.
 * Um hotel que não chegou ao Andaime ou é de outra obra fica "por definir".
 */
export function mapStays(rows, employeeIds, siteIds, hotelsByLegacy = new Map()) {
  const stays = [];
  const rejected = [];
  const transformations = { weekMovedToMonday: 0, weekFromCheckIn: 0, hotelUnset: 0 };
  const seen = new Set();
  for (const row of [...rows].sort((a, b) => Number(a.id) - Number(b.id))) {
    const legacyId = Number(row.id);
    const reject = (reason) => rejection(rejected, 'dormidas', legacyId, reason);
    const employeeId = employeeIds.get(Number(row.trabalhador_id));
    const siteId = siteIds.get(Number(row.projeto_id));
    const checkIn = trimmed(row.entrada);
    const checkOut = trimmed(row.saida);
    if (!employeeId) { reject('colaborador-inexistente'); continue; }
    if (!siteId) { reject('obra-inexistente'); continue; }
    if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) { reject('data-invalida'); continue; }

    let week = trimmed(row.semana_inicio);
    if (!isIsoDate(week)) {
      week = mondayOf(checkIn);
      transformations.weekFromCheckIn += 1;
    } else if (mondayOf(week) !== week) {
      week = mondayOf(week);
      transformations.weekMovedToMonday += 1;
    }
    const nights = daysBetween(checkIn, checkOut);
    if (nights <= 0) { reject('saida-nao-posterior-a-entrada'); continue; }
    if (nights > 14) { reject('mais-de-14-noites'); continue; }
    if (checkIn < addDays(week, -7) || checkIn > addDays(week, 6)) { reject('entrada-fora-da-semana'); continue; }
    const key = `${employeeId}:${siteId}:${week}`;
    if (seen.has(key)) { reject('estadia-repetida-na-semana'); continue; }
    seen.add(key);

    let hotelId = null;
    if (row.hotel_id != null) {
      const hotel = hotelsByLegacy.get(Number(row.hotel_id));
      if (hotel && hotel.siteId === siteId) hotelId = hotel.id;
      else transformations.hotelUnset += 1;
    }
    stays.push({
      legacyId,
      id: randomUUID(),
      employeeId,
      siteId,
      week,
      hotelId,
      checkIn,
      checkOut,
      notes: text(row.observacoes, 500)
    });
  }
  return { stays, rejected, transformations };
}

// --- diário de obra ----------------------------------------------------------------------------------

export const DIARY_DEFAULT_TITLE = 'Registo do diário';

/** Instante em ms. Sem fuso indicado é UTC, como o `datetime('now')` do SQLite; o que não se lê dá NaN. */
export function parseUtcTimestamp(value) {
  const candidate = trimmed(value);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(candidate)) {
    return Date.parse(`${candidate.replace(' ', 'T')}Z`);
  }
  return /^\d{4}-\d{2}-\d{2}T/.test(candidate) ? Date.parse(candidate) : Number.NaN;
}
const DIARY_TITLE_MAX = 160;
const DIARY_BODY_MAX = 10_000;

/**
 * Registos do diário (`relatorios`), só o texto. O autor do Lyrical é texto livre, sem conta associada: o registo
 * fica do dono que importa, com o papel MANAGER ("Direção de obra"), e o nome original vai para o fim do texto.
 * As fotografias não são importadas; contam-se para o relatório.
 */
export function mapDiaryEntries(rows, siteIds, photoCountByEntry = new Map()) {
  const entries = [];
  const rejected = [];
  const transformations = { untitled: 0, titlesTruncated: 0, bodiesTruncated: 0, authorKeptInBody: 0 };
  let photosSkipped = 0;
  let entriesWithPhotos = 0;
  for (const row of [...rows].sort((a, b) => Number(a.id) - Number(b.id))) {
    const legacyId = Number(row.id);
    const photos = Number(photoCountByEntry.get(legacyId) || 0);
    photosSkipped += photos;
    if (photos > 0) entriesWithPhotos += 1;
    const siteId = siteIds.get(Number(row.projeto_id));
    const entryDate = trimmed(row.data);
    if (!siteId) { rejection(rejected, 'relatorios', legacyId, 'obra-inexistente'); continue; }
    if (!isIsoDate(entryDate)) { rejection(rejected, 'relatorios', legacyId, 'data-invalida'); continue; }

    let title = trimmed(row.titulo).replace(/\s+/g, ' ');
    if (!title) {
      title = DIARY_DEFAULT_TITLE;
      transformations.untitled += 1;
    } else if (title.length > DIARY_TITLE_MAX) {
      title = `${title.slice(0, DIARY_TITLE_MAX - 1)}…`;
      transformations.titlesTruncated += 1;
    }
    const author = text(row.autor, 80);
    let body = trimmed(row.texto);
    const suffix = author ? `${body ? '\n\n' : ''}— Autor no Lyrical: ${author}` : '';
    if (body.length + suffix.length > DIARY_BODY_MAX) {
      body = `${body.slice(0, DIARY_BODY_MAX - suffix.length - 1)}…`;
      transformations.bodiesTruncated += 1;
    }
    if (author) transformations.authorKeptInBody += 1;
    const createdMs = parseUtcTimestamp(row.criado_em);
    entries.push({
      legacyId,
      id: randomUUID(),
      siteId,
      entryDate,
      title,
      body: body + suffix,
      createdAt: Number.isFinite(createdMs) ? new Date(createdMs).toISOString() : null
    });
  }
  return { entries, rejected, transformations, photosSkipped, entriesWithPhotos };
}

/** Recusas agrupadas por tabela e motivo, só com ids do Lyrical (nunca nomes). */
export function groupRejections(rejected, maxIds = 50) {
  const grouped = {};
  for (const { table, id, reason } of rejected) {
    const byReason = (grouped[table] ??= {});
    const entry = (byReason[reason] ??= { count: 0, ids: [] });
    entry.count += 1;
    if (entry.ids.length < maxIds) entry.ids.push(id);
  }
  return grouped;
}

export function sql(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function jsonSql(value) {
  return `${sql(JSON.stringify(value))}::jsonb`;
}

const dateSql = (value) => (value ? `${sql(value)}::date` : 'NULL');
const uuidSql = (value) => (value ? `${sql(value)}::uuid` : 'NULL');

export function buildImportSql({
  email, displayName, organizationName, employees, teams, memberships, sites, sourceCounts,
  absences = [], hotels = [], stays = [], diaryEntries = [], notImported = {}
}) {
  const userId = randomUUID();
  const organizationId = randomUUID();
  const employeeIds = new Map(employees.map((employee) => [employee.legacyId, employee.id]));
  const teamIds = new Map(teams.map((team) => [team.legacyId, team.id]));
  const importedMemberships = memberships
    .map((membership) => ({
      ...membership,
      employeeId: employeeIds.get(membership.employeeId),
      teamId: teamIds.get(membership.teamId)
    }))
    .filter((membership) => membership.employeeId && membership.teamId);

  const statements = [
    '\\set ON_ERROR_STOP on',
    'BEGIN;',
    `DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM users WHERE lower(email::text) = lower(${sql(email)})) THEN
        RAISE EXCEPTION 'A conta de destino já existe.';
      END IF;
      IF EXISTS (SELECT 1 FROM organizations WHERE lower(name) = lower(${sql(organizationName)})) THEN
        RAISE EXCEPTION 'A empresa de destino já existe.';
      END IF;
    END $$;`,
    `INSERT INTO users (id, email, password_hash, display_name, email_verified_at)
     VALUES (${sql(userId)}::uuid, ${sql(email)}, '!RESET_REQUIRED!', ${sql(displayName)}, now());`,
    `INSERT INTO organizations (id, name, legal_name, country, default_timezone, created_by_user_id)
     VALUES (${sql(organizationId)}::uuid, ${sql(organizationName)}, ${sql(organizationName)}, 'PT', 'Europe/Lisbon', ${sql(userId)}::uuid);`,
    `INSERT INTO memberships (organization_id, user_id, role)
     VALUES (${sql(organizationId)}::uuid, ${sql(userId)}::uuid, 'OWNER');`,
    `INSERT INTO labor_policies (organization_id, country, effective_during, daily_normal_min, weekly_normal_min, auto_break_after_min, auto_break_min)
     VALUES (${sql(organizationId)}::uuid, NULL, daterange(current_date, NULL, '[)'), 480, 2400, 360, 60);`,
    `INSERT INTO conflict_rule_settings (organization_id, rule, severity) VALUES
      ${['EMPLOYEE_OVERLAP', 'VEHICLE_OVERLAP', 'ABSENCE', 'UNAVAILABLE', 'DAILY_CAPACITY', 'TEAM_MISMATCH',
        'VEHICLE_CAPACITY', 'MISSING_FOREMAN', 'MULTIPLE_SITES_DAY', 'VEHICLE_UNAVAILABLE', 'SITE_HOUR_LIMIT']
        .map((rule) => `(${sql(organizationId)}::uuid, ${sql(rule)}, ${sql(['EMPLOYEE_OVERLAP', 'VEHICLE_OVERLAP', 'ABSENCE', 'UNAVAILABLE', 'VEHICLE_UNAVAILABLE'].includes(rule) ? 'BLOCK' : 'WARN')})`)
        .join(',\n      ')};`,
    `UPDATE users SET last_active_org_id = ${sql(organizationId)}::uuid, version = version + 1 WHERE id = ${sql(userId)}::uuid;`,
    `INSERT INTO audit_event (organization_id, actor_user_id, actor_role, action, entity_type, entity_id)
     VALUES (${sql(organizationId)}::uuid, ${sql(userId)}::uuid, 'OWNER', 'organization.created', 'organization', ${sql(organizationId)}::uuid);`
  ];

  for (const employee of employees) {
    statements.push(`INSERT INTO employees
      (id, organization_id, number, full_name, category, phone, status, daily_capacity_min, skills, sizes)
      VALUES (${sql(employee.id)}::uuid, ${sql(organizationId)}::uuid, ${sql(employee.number)}, ${sql(employee.fullName)},
              ${sql(employee.category)}, ${sql(employee.phone)}, 'ACTIVE', 480, '{}', ${jsonSql(employee.sizes)});`);
  }
  for (const team of teams) {
    statements.push(`INSERT INTO teams (id, organization_id, name, color)
      VALUES (${sql(team.id)}::uuid, ${sql(organizationId)}::uuid, ${sql(team.name)}, ${sql(team.color)});`);
  }
  for (const membership of importedMemberships) {
    statements.push(`INSERT INTO team_members (organization_id, team_id, employee_id, joined_on, created_by_user_id)
      VALUES (${sql(organizationId)}::uuid, ${sql(membership.teamId)}::uuid, ${sql(membership.employeeId)}::uuid,
              ${sql(membership.joinedOn)}::date, ${sql(userId)}::uuid);`);
  }
  for (const site of sites) {
    statements.push(`INSERT INTO sites
      (id, organization_id, code, name, country, address, latitude, longitude, timezone, status,
       start_date, end_date, hour_limit_min, baseline_realized_min, baseline_approved_min, color, erp_order)
      VALUES (${sql(site.id)}::uuid, ${sql(organizationId)}::uuid, ${sql(site.code)}, ${sql(site.name)}, 'PT',
              ${sql(site.address)}, ${sql(site.latitude)}, ${sql(site.longitude)}, 'Europe/Lisbon', ${sql(site.status)},
              ${site.startDate ? `${sql(site.startDate)}::date` : 'NULL'}, ${site.endDate ? `${sql(site.endDate)}::date` : 'NULL'},
              ${sql(site.hourLimitMin)}, 0, 0, ${sql(site.color)}, ${sql(site.erpOrder)});`);
  }
  for (const absence of absences) {
    statements.push(`INSERT INTO absences
      (id, organization_id, employee_id, kind, starts_on, ends_on, status, note,
       requested_by_user_id, decided_by_user_id, decided_at)
      VALUES (${sql(absence.id)}::uuid, ${sql(organizationId)}::uuid, ${sql(absence.employeeId)}::uuid, ${sql(absence.kind)},
              ${dateSql(absence.startsOn)}, ${dateSql(absence.endsOn)}, 'APPROVED', ${sql(absence.note)},
              ${sql(userId)}::uuid, ${sql(userId)}::uuid, now());`);
  }
  for (const hotel of hotels) {
    statements.push(`INSERT INTO hotels (id, organization_id, site_id, name, address, contact, notes)
      VALUES (${sql(hotel.id)}::uuid, ${sql(organizationId)}::uuid, ${sql(hotel.siteId)}::uuid, ${sql(hotel.name)},
              ${sql(hotel.address)}, ${sql(hotel.contact)}, ${sql(hotel.notes)});`);
  }
  for (const stay of stays) {
    statements.push(`INSERT INTO stays
      (id, organization_id, employee_id, site_id, week, hotel_id, check_in, check_out, notes, created_by_user_id)
      VALUES (${sql(stay.id)}::uuid, ${sql(organizationId)}::uuid, ${sql(stay.employeeId)}::uuid, ${sql(stay.siteId)}::uuid,
              ${dateSql(stay.week)}, ${uuidSql(stay.hotelId)}, ${dateSql(stay.checkIn)}, ${dateSql(stay.checkOut)},
              ${sql(stay.notes)}, ${sql(userId)}::uuid);`);
  }
  for (const entry of diaryEntries) {
    const createdAt = entry.createdAt ? `${sql(entry.createdAt)}::timestamptz` : 'now()';
    statements.push(`INSERT INTO diary_entries
      (id, organization_id, site_id, entry_date, title, body, author_user_id, author_role, created_at, updated_at)
      VALUES (${sql(entry.id)}::uuid, ${sql(organizationId)}::uuid, ${sql(entry.siteId)}::uuid, ${dateSql(entry.entryDate)},
              ${sql(entry.title)}, ${sql(entry.body)}, ${sql(userId)}::uuid, 'MANAGER', ${createdAt}, ${createdAt});`);
  }
  const auditChanges = {
    source: 'Lyrical Design SQLite',
    imported: {
      employees: employees.length,
      teams: teams.length,
      teamMembers: importedMemberships.length,
      sites: sites.length,
      absences: absences.length,
      hotels: hotels.length,
      stays: stays.length,
      diaryEntries: diaryEntries.length
    },
    notImported,
    preservedForLater: sourceCounts
  };
  statements.push(`INSERT INTO audit_event
      (organization_id, actor_user_id, actor_role, action, entity_type, entity_id, changes)
    VALUES (${sql(organizationId)}::uuid, ${sql(userId)}::uuid, 'SYSTEM', 'legacy.import.completed',
            'organization', ${sql(organizationId)}::uuid, ${jsonSql(auditChanges)});`);
  const expected = {
    employees: employees.length,
    teams: teams.length,
    team_members: importedMemberships.length,
    sites: sites.length,
    absences: absences.length,
    hotels: hotels.length,
    stays: stays.length,
    diary_entries: diaryEntries.length
  };
  statements.push(`DO $$ BEGIN
${Object.entries(expected).map(([table, count]) => `      IF (SELECT count(*) FROM ${table} WHERE organization_id = ${sql(organizationId)}::uuid) <> ${count} THEN
        RAISE EXCEPTION 'Contagem inesperada em ${table}.';
      END IF;`).join('\n')}
    END $$;`);
  statements.push('COMMIT;');
  statements.push(`SELECT json_build_object(
    'organizationId', ${sql(organizationId)},
    'userId', ${sql(userId)},
    'employees', (SELECT count(*) FROM employees WHERE organization_id = ${sql(organizationId)}::uuid),
    'teams', (SELECT count(*) FROM teams WHERE organization_id = ${sql(organizationId)}::uuid),
    'teamMembers', (SELECT count(*) FROM team_members WHERE organization_id = ${sql(organizationId)}::uuid),
    'sites', (SELECT count(*) FROM sites WHERE organization_id = ${sql(organizationId)}::uuid),
    'absences', (SELECT count(*) FROM absences WHERE organization_id = ${sql(organizationId)}::uuid),
    'hotels', (SELECT count(*) FROM hotels WHERE organization_id = ${sql(organizationId)}::uuid),
    'stays', (SELECT count(*) FROM stays WHERE organization_id = ${sql(organizationId)}::uuid),
    'diaryEntries', (SELECT count(*) FROM diary_entries WHERE organization_id = ${sql(organizationId)}::uuid)
  );`);
  return { sql: `${statements.join('\n\n')}\n`, userId, organizationId, importedMemberships: importedMemberships.length };
}

export const REQUIRED_TABLES = ['trabalhadores', 'equipas', 'projetos', 'escalas_semanais', 'escala_trabalhadores'];

const countBy = (rows, key) => rows.reduce((counts, row) => {
  counts[row[key]] = (counts[row[key]] || 0) + 1;
  return counts;
}, {});

/**
 * Lê uma cópia da base do Lyrical (já verificada) e devolve o plano de importação e o resumo da simulação.
 * Os módulos mais recentes (férias, ausências, hotéis, dormidas, diário) são opcionais: bases antigas não os têm.
 * O resumo só leva contagens, motivos e ids do Lyrical — nunca nomes nem textos.
 */
export function readLyricalDatabase(db, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  for (const required of REQUIRED_TABLES) {
    if (!tables.has(required)) throw new Error(`Tabela obrigatória em falta: ${required}`);
  }
  const count = (table) => (tables.has(table) ? Number(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n) : 0);
  const rowsOf = (table) => (tables.has(table) ? db.prepare(`SELECT * FROM ${table} ORDER BY id`).all() : []);

  const usedEmployeeNumbers = new Set();
  const employees = rowsOf('trabalhadores').map((row) => mapEmployee(row, usedEmployeeNumbers));
  const teams = rowsOf('equipas').map((row, index) => ({
    legacyId: Number(row.id),
    id: randomUUID(),
    name: String(row.nome).trim().slice(0, 80),
    color: TEAM_COLORS[index % TEAM_COLORS.length]
  }));
  const rawAssignments = db.prepare(`
    SELECT et.trabalhador_id employeeId, e.equipa_id teamId, e.semana_inicio week, e.dias days
      FROM escala_trabalhadores et
      JOIN escalas_semanais e ON e.id = et.escala_id
     ORDER BY e.semana_inicio, et.trabalhador_id, e.id
  `).all();
  const selected = selectCurrentTeamMemberships(rawAssignments);
  const usedSiteCodes = new Set();
  const sites = rowsOf('projetos').map((row, index) => mapSite(row, index, today, usedSiteCodes));

  const employeeIds = new Map(employees.map((employee) => [employee.legacyId, employee.id]));
  const siteIds = new Map(sites.map((site) => [site.legacyId, site.id]));

  const absences = mapAbsences({ vacations: rowsOf('ferias'), absences: rowsOf('ausencias') }, employeeIds);
  const hotels = mapHotels(rowsOf('hoteis'), siteIds);
  const stays = mapStays(rowsOf('dormidas'), employeeIds, siteIds, hotels.byLegacy);
  const photoCountByEntry = new Map(tables.has('relatorio_fotos')
    ? db.prepare('SELECT relatorio_id id, COUNT(*) n FROM relatorio_fotos GROUP BY relatorio_id').all()
      .map((row) => [Number(row.id), Number(row.n)])
    : []);
  const diary = mapDiaryEntries(rowsOf('relatorios'), siteIds, photoCountByEntry);

  const rejected = [...absences.rejected, ...hotels.rejected, ...stays.rejected, ...diary.rejected];
  const notImported = Object.fromEntries(Object.entries(groupRejections(rejected))
    .map(([table, reasons]) => [table, Object.fromEntries(Object.entries(reasons).map(([reason, { count }]) => [reason, count]))]));

  const sourceCounts = {
    vehicles: count('viaturas'),
    schedules: count('escalas_semanais'),
    scheduleEmployees: count('escala_trabalhadores'),
    hours: count('registos_horas'),
    tools: count('ferramentas'),
    employeeTools: count('trabalhador_ferramentas'),
    projectTools: count('projeto_ferramentas'),
    hrFiles: count('ficheiros_rh')
  };

  const summary = {
    importNow: {
      employees: employees.length,
      teams: teams.length,
      currentTeamMembers: selected.memberships.length,
      ambiguousCurrentTeamChoices: selected.ambiguous,
      sites: sites.length,
      absences: absences.rows.length,
      absencesByKind: countBy(absences.rows, 'kind'),
      hotels: hotels.hotels.length,
      stays: stays.stays.length,
      staysWithoutHotel: stays.stays.filter((stay) => !stay.hotelId).length,
      diaryEntries: diary.entries.length
    },
    source: {
      vacations: count('ferias'),
      absences: count('ausencias'),
      hotels: count('hoteis'),
      stays: count('dormidas'),
      diaryEntries: count('relatorios'),
      diaryPhotos: count('relatorio_fotos')
    },
    notImported: groupRejections(rejected),
    preservedForLater: sourceCounts,
    transformations: {
      employeesWithoutCategory: employees.filter((employee) => employee.category === 'Sem categoria').length,
      sitesWithoutPositiveHourLimit: sites.filter((site) => site.hourLimitMin == null).length,
      absences: absences.transformations,
      hotels: { mergedDuplicateNames: hotels.merged },
      stays: stays.transformations,
      diary: diary.transformations,
      photos: {
        diaryPhotosExcluded: diary.photosSkipped,
        diaryEntriesWithPhotos: diary.entriesWithPhotos,
        note: 'ignoradas por opção do utilizador'
      },
      integrations: 'tokens e configurações excluídos'
    }
  };

  return {
    plan: {
      employees,
      teams,
      memberships: selected.memberships,
      sites,
      sourceCounts,
      absences: absences.rows,
      hotels: hotels.hotels,
      stays: stays.stays,
      diaryEntries: diary.entries,
      notImported
    },
    summary
  };
}
