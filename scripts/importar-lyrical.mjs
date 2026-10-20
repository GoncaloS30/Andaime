#!/usr/bin/env node
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

import {
  TEAM_COLORS,
  buildImportSql,
  mapEmployee,
  mapSite,
  selectCurrentTeamMemberships
} from './lib/lyrical-import.mjs';

function argumentsOf(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];
    if (!argument.startsWith('--')) throw new Error(`Argumento inesperado: ${argument}`);
    const key = argument.slice(2);
    if (key === 'help') options.help = true;
    else options[key] = argv[++i];
  }
  return options;
}

function usage() {
  console.log(`Uso:
  node scripts/importar-lyrical.mjs --db <escala.db> [--email <email> --org <nome> --display-name <nome> --output <ficheiro.sql>]

Sem --output, apenas valida e apresenta o plano. O SQL gerado nunca inclui configurações,
tokens Google/Microsoft, fotografias ou os módulos ainda sem destino no backend.`);
}

const options = argumentsOf(process.argv.slice(2));
if (options.help) {
  usage();
  process.exit(0);
}
if (!options.db) throw new Error('Indique --db <escala.db>.');
if (options.output && (!options.email || !options.org || !options['display-name'])) {
  throw new Error('--output requer --email, --org e --display-name.');
}

const original = resolve(options.db);
if (!existsSync(original)) throw new Error(`Base não encontrada: ${original}`);
const snapshotDir = mkdtempSync(join(tmpdir(), 'andaime-lyrical-'));
const snapshot = join(snapshotDir, 'escala.db');

try {
  copyFileSync(original, snapshot);
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${original}${suffix}`;
    if (existsSync(sidecar)) copyFileSync(sidecar, `${snapshot}${suffix}`);
  }

  const db = new DatabaseSync(snapshot);
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').all();
  const quickCheck = Object.values(db.prepare('PRAGMA quick_check').get())[0];
  const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all().length;
  if (quickCheck !== 'ok' || foreignKeyViolations !== 0) {
    throw new Error(`Base inconsistente: quick_check=${quickCheck}; FKs=${foreignKeyViolations}.`);
  }

  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  for (const required of ['trabalhadores', 'equipas', 'projetos', 'escalas_semanais', 'escala_trabalhadores']) {
    if (!tables.has(required)) throw new Error(`Tabela obrigatória em falta: ${required}`);
  }
  const count = (table) => tables.has(table) ? Number(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n) : 0;

  const usedEmployeeNumbers = new Set();
  const employees = db.prepare('SELECT * FROM trabalhadores ORDER BY id').all()
    .map((row) => mapEmployee(row, usedEmployeeNumbers));
  const teams = db.prepare('SELECT * FROM equipas ORDER BY id').all().map((row, index) => ({
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
  const today = new Date().toISOString().slice(0, 10);
  const sites = db.prepare('SELECT * FROM projetos ORDER BY id').all()
    .map((row, index) => mapSite(row, index, today, usedSiteCodes));

  const sourceCounts = {
    vehicles: count('viaturas'),
    schedules: count('escalas_semanais'),
    scheduleEmployees: count('escala_trabalhadores'),
    hours: count('registos_horas'),
    vacations: count('ferias'),
    absences: count('ausencias'),
    tools: count('ferramentas'),
    employeeTools: count('trabalhador_ferramentas'),
    projectTools: count('projeto_ferramentas'),
    hotels: count('hoteis'),
    stays: count('dormidas'),
    reports: count('relatorios'),
    photoReferencesIgnored: count('relatorio_fotos'),
    hrFiles: count('ficheiros_rh')
  };
  const summary = {
    integrity: 'ok',
    importNow: {
      employees: employees.length,
      teams: teams.length,
      currentTeamMembers: selected.memberships.length,
      ambiguousCurrentTeamChoices: selected.ambiguous,
      sites: sites.length
    },
    preservedForLater: sourceCounts,
    transformations: {
      employeesWithoutCategory: employees.filter((employee) => employee.category === 'Sem categoria').length,
      sitesWithoutPositiveHourLimit: sites.filter((site) => site.hourLimitMin == null).length,
      photos: 'ignoradas por opção do utilizador',
      integrations: 'tokens e configurações excluídos'
    }
  };

  if (options.output) {
    const output = resolve(options.output);
    const built = buildImportSql({
      email: options.email.trim().toLowerCase(),
      displayName: options['display-name'].trim(),
      organizationName: options.org.trim(),
      employees,
      teams,
      memberships: selected.memberships,
      sites,
      sourceCounts
    });
    writeFileSync(output, built.sql, { encoding: 'utf8', mode: 0o600 });
    summary.sqlOutput = basename(output);
    summary.target = { email: options.email.trim().toLowerCase(), organization: options.org.trim() };
    summary.generated = { organizationId: built.organizationId, userId: built.userId };
  }
  console.log(JSON.stringify(summary, null, 2));
  db.close();
} finally {
  rmSync(snapshotDir, { recursive: true, force: true });
}
