import { randomUUID } from 'node:crypto';

export const TEAM_COLORS = ['#2a78d6', '#d4652f', '#1a9e72', '#8a4fc7', '#c0457f', '#3f8a2a'];
export const SITE_COLORS = ['#2a78d6', '#1a9e72', '#d4652f', '#8a4fc7', '#2196a8', '#c0457f'];

const text = (value, max) => {
  const normalized = value == null ? '' : String(value).trim();
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

export function buildImportSql({ email, displayName, organizationName, employees, teams, memberships, sites, sourceCounts }) {
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
  const auditChanges = {
    source: 'Lyrical Design SQLite',
    imported: { employees: employees.length, teams: teams.length, teamMembers: importedMemberships.length, sites: sites.length },
    preservedForLater: sourceCounts
  };
  statements.push(`INSERT INTO audit_event
      (organization_id, actor_user_id, actor_role, action, entity_type, entity_id, changes)
    VALUES (${sql(organizationId)}::uuid, ${sql(userId)}::uuid, 'SYSTEM', 'legacy.import.completed',
            'organization', ${sql(organizationId)}::uuid, ${jsonSql(auditChanges)});`);
  statements.push('COMMIT;');
  statements.push(`SELECT json_build_object(
    'organizationId', ${sql(organizationId)},
    'userId', ${sql(userId)},
    'employees', (SELECT count(*) FROM employees WHERE organization_id = ${sql(organizationId)}::uuid),
    'teams', (SELECT count(*) FROM teams WHERE organization_id = ${sql(organizationId)}::uuid),
    'teamMembers', (SELECT count(*) FROM team_members WHERE organization_id = ${sql(organizationId)}::uuid),
    'sites', (SELECT count(*) FROM sites WHERE organization_id = ${sql(organizationId)}::uuid)
  );`);
  return { sql: `${statements.join('\n\n')}\n`, userId, organizationId, importedMemberships: importedMemberships.length };
}
