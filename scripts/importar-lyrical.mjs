#!/usr/bin/env node
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { buildImportSql, readLyricalDatabase } from './lib/lyrical-import.mjs';

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

  const { plan, summary: planSummary } = readLyricalDatabase(db);
  const summary = { integrity: 'ok', ...planSummary };

  if (options.output) {
    const output = resolve(options.output);
    const built = buildImportSql({
      email: options.email.trim().toLowerCase(),
      displayName: options['display-name'].trim(),
      organizationName: options.org.trim(),
      ...plan
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
