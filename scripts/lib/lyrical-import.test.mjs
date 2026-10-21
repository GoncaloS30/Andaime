import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import {
  ABSENCE_KIND_MAP,
  DIARY_DEFAULT_TITLE,
  buildImportSql,
  foldName,
  isIsoDate,
  mapAbsences,
  mapDiaryEntries,
  mapEmployee,
  mapHotels,
  mapSite,
  mapStays,
  mondayOf,
  parseUtcTimestamp,
  readLyricalDatabase,
  selectCurrentTeamMemberships,
  sql,
  uniqueCode
} from './lyrical-import.mjs';

test('normaliza códigos e evita colisões', () => {
  const used = new Set();
  assert.equal(uniqueCode(' Obra ção / 1 ', 'LEGACY-1', 20, used), 'OBRA-CAO-1');
  assert.equal(uniqueCode('Obra ção 1', 'LEGACY-2', 20, used), 'OBRA-CAO-1-2');
});

test('mapeia colaborador e tamanhos sem inventar dados pessoais', () => {
  const employee = mapEmployee({
    id: 7,
    numero_mecanografico: ' 00/7 ',
    nome: ' Pessoa Teste ',
    categoria: '',
    contacto: null,
    tamanho_tshirt: ' L ',
    tamanho_sweat: null,
    tamanho_calcas: '42',
    tamanho_botas: '',
    tamanho_parka: 'XL'
  });
  assert.equal(employee.number, '00-7');
  assert.equal(employee.category, 'Sem categoria');
  assert.deepEqual(employee.sizes, { tshirt: 'L', calcas: '42', parka: 'XL' });
});

test('limites negativos ficam sem limite e datas determinam o estado da obra', () => {
  const site = mapSite({
    id: 3,
    codigo_pep: 'obra 3',
    descricao: 'Obra de teste',
    limite_horas: -1,
    latitude: 41.1,
    longitude: -8.6,
    data_inicio: '2026-01-01',
    data_fim: '2026-08-01',
    data_previsao_fim: null,
    ordem: '123'
  }, 0, '2026-10-19');
  assert.equal(site.code, 'OBRA-3');
  assert.equal(site.hourLimitMin, null);
  assert.equal(site.status, 'DONE');
});

test('equipa atual usa a semana mais recente e o maior número de dias', () => {
  const result = selectCurrentTeamMemberships([
    { employeeId: 1, teamId: 1, week: '2026-10-12', days: '12345' },
    { employeeId: 1, teamId: 2, week: '2026-10-19', days: '12' },
    { employeeId: 1, teamId: 3, week: '2026-10-19', days: '345' }
  ]);
  assert.equal(result.ambiguous, 1);
  assert.deepEqual(result.memberships[0], { employeeId: 1, teamId: 3, joinedOn: '2026-10-19', alternatives: 2 });
});

test('escapa valores SQL', () => {
  assert.equal(sql("O'Brien"), "'O''Brien'");
  assert.equal(sql(null), 'NULL');
});

test('datas: calendário real e segunda-feira ISO', () => {
  assert.equal(isIsoDate('2026-02-28'), true);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('28/02/2026'), false);
  assert.equal(mondayOf('2026-10-19'), '2026-10-19');
  assert.equal(mondayOf('2026-10-25'), '2026-10-19');
  assert.equal(mondayOf('2026-10-21'), '2026-10-19');
});

test('ausências: tipos, notas, recusas e sobreposições como no Lyrical', () => {
  const employeeIds = new Map([[1, 'e1'], [2, 'e2']]);
  const result = mapAbsences({
    vacations: [
      { id: 1, trabalhador_id: 1, data_inicio: '2026-08-03', data_fim: '2026-08-14', observacoes: null },
      // Coberta por inteiro pelas férias 1: recusada.
      { id: 2, trabalhador_id: 1, data_inicio: '2026-08-05', data_fim: '2026-08-07' },
      { id: 3, trabalhador_id: 9, data_inicio: '2026-08-03', data_fim: '2026-08-04' },
      { id: 4, trabalhador_id: 2, data_inicio: '2026-13-01', data_fim: '2026-13-02' }
    ],
    absences: [
      // Começa dentro das férias 1 e acaba depois: passa a começar no dia seguinte.
      { id: 10, trabalhador_id: 1, tipo: 'baixa', data_inicio: '2026-08-12', data_fim: '2026-08-20', observacoes: ' nota ' },
      { id: 11, trabalhador_id: 2, tipo: 'falta_injustificada', data_inicio: '2026-09-01', data_fim: '2026-09-01' },
      { id: 12, trabalhador_id: 2, tipo: 'licenca', data_inicio: '2026-09-07', data_fim: '2026-09-11' },
      { id: 13, trabalhador_id: 2, tipo: 'outra', data_inicio: '2026-09-15', data_fim: '2026-09-14' },
      { id: 14, trabalhador_id: 2, tipo: 'desconhecido', data_inicio: '2026-10-01', data_fim: '2026-10-01' },
      { id: 15, trabalhador_id: 2, tipo: 'formacao', data_inicio: '2026-01-01', data_fim: '2027-03-01' },
      { id: 16, trabalhador_id: 2, tipo: 'falta_justificada', data_inicio: '2026-11-02', data_fim: '2026-11-02', observacoes: 'x'.repeat(600) }
    ]
  }, employeeIds);

  const byLegacy = new Map(result.rows.map((row) => [`${row.origin}:${row.legacyId}`, row]));
  assert.equal(byLegacy.get('ferias:1').kind, 'VACATION');
  assert.equal(byLegacy.get('ausencias:10').kind, 'SICK');
  assert.equal(byLegacy.get('ausencias:10').startsOn, '2026-08-15');
  assert.equal(byLegacy.get('ausencias:10').note, 'nota');
  assert.equal(byLegacy.get('ausencias:11').kind, 'OTHER');
  assert.equal(byLegacy.get('ausencias:11').note, 'Falta injustificada');
  assert.equal(byLegacy.get('ausencias:12').kind, 'LEAVE');
  assert.equal(byLegacy.get('ausencias:14').kind, 'OTHER');
  assert.equal(byLegacy.get('ausencias:14').note, 'Tipo no Lyrical: desconhecido');
  assert.equal(byLegacy.get('ausencias:16').kind, 'PERSONAL');
  assert.equal(byLegacy.get('ausencias:16').note.length, 500);
  assert.ok(byLegacy.get('ausencias:16').note.startsWith('Falta justificada — x'));

  assert.deepEqual(result.rejected.map(({ table, id, reason }) => `${table}:${id}:${reason}`).sort(), [
    'ausencias:13:fim-antes-do-inicio',
    'ausencias:15:periodo-acima-de-366-dias',
    'ferias:2:coberta-por-outra-ausencia',
    'ferias:3:colaborador-inexistente',
    'ferias:4:data-invalida'
  ]);
  assert.deepEqual(result.transformations, { kindLabelInNote: 2, unknownTypes: 1, trimmedOverlaps: 1, notesTruncated: 1 });
  assert.deepEqual(Object.keys(ABSENCE_KIND_MAP).sort(),
    ['baixa', 'falta_injustificada', 'falta_justificada', 'ferias', 'formacao', 'licenca', 'outra']);
});

test('hotéis: um nome por obra sem acentos, maiúsculas nem espaços repetidos', () => {
  assert.equal(foldName('  Hotel São João '), 'hotel sao joao');
  assert.equal(foldName('Øresund'), foldName('oresund'));
  const siteIds = new Map([[1, 's1'], [2, 's2']]);
  const result = mapHotels([
    { id: 1, projeto_id: 1, nome: 'Hotel São João', morada: null, contacto: '200', notas: null },
    { id: 2, projeto_id: 1, nome: ' hotel  sao   JOAO ', morada: 'Rua A', contacto: '999', notas: null },
    { id: 3, projeto_id: 2, nome: 'Hotel São João', morada: null },
    { id: 4, projeto_id: 1, nome: 'X' },
    { id: 5, projeto_id: 7, nome: 'Sem obra' }
  ], siteIds);
  assert.equal(result.hotels.length, 2);
  assert.equal(result.merged, 1);
  const first = result.byLegacy.get(1);
  assert.equal(result.byLegacy.get(2), first);
  assert.equal(first.address, 'Rua A');
  assert.equal(first.contact, '200');
  assert.notEqual(result.byLegacy.get(3), first);
  assert.deepEqual(result.rejected.map((r) => `${r.id}:${r.reason}`), ['4:nome-invalido', '5:obra-inexistente']);
});

test('dormidas: semana à segunda, regras da tabela e hotel por definir', () => {
  const employeeIds = new Map([[1, 'e1']]);
  const siteIds = new Map([[1, 's1'], [2, 's2']]);
  const hotels = mapHotels([
    { id: 1, projeto_id: 1, nome: 'Hotel Um' },
    { id: 2, projeto_id: 2, nome: 'Hotel Dois' }
  ], siteIds);
  const result = mapStays([
    { id: 1, trabalhador_id: 1, projeto_id: 1, hotel_id: 1, semana_inicio: '2026-10-19', entrada: '2026-10-19', saida: '2026-10-23' },
    // Semana guardada numa quarta-feira: passa para a segunda.
    { id: 2, trabalhador_id: 1, projeto_id: 2, hotel_id: 1, semana_inicio: '2026-10-28', entrada: '2026-10-26', saida: '2026-10-30' },
    { id: 3, trabalhador_id: 1, projeto_id: 1, hotel_id: null, semana_inicio: '2026-10-19', entrada: '2026-10-20', saida: '2026-10-22' },
    { id: 4, trabalhador_id: 1, projeto_id: 1, semana_inicio: '2026-11-02', entrada: '2026-11-03', saida: '2026-11-03' },
    { id: 5, trabalhador_id: 1, projeto_id: 1, semana_inicio: '2026-11-09', entrada: '2026-11-09', saida: '2026-11-25' },
    { id: 6, trabalhador_id: 1, projeto_id: 1, semana_inicio: '2026-11-16', entrada: '2026-11-30', saida: '2026-12-02' },
    { id: 7, trabalhador_id: 4, projeto_id: 1, semana_inicio: '2026-11-16', entrada: '2026-11-16', saida: '2026-11-18' },
    { id: 8, trabalhador_id: 1, projeto_id: 1, semana_inicio: 'sem data', entrada: '2026-12-09', saida: '2026-12-11' }
  ], employeeIds, siteIds, hotels.byLegacy);

  const byLegacy = new Map(result.stays.map((stay) => [stay.legacyId, stay]));
  assert.equal(byLegacy.get(1).hotelId, hotels.byLegacy.get(1).id);
  assert.equal(byLegacy.get(2).week, '2026-10-26');
  assert.equal(byLegacy.get(2).hotelId, null);
  assert.equal(byLegacy.get(8).week, '2026-12-07');
  assert.deepEqual(result.rejected.map((r) => `${r.id}:${r.reason}`), [
    '3:estadia-repetida-na-semana',
    '4:saida-nao-posterior-a-entrada',
    '5:mais-de-14-noites',
    '6:entrada-fora-da-semana',
    '7:colaborador-inexistente'
  ]);
  assert.deepEqual(result.transformations, { weekMovedToMonday: 1, weekFromCheckIn: 1, hotelUnset: 1 });
});

test('diário: só texto, título por omissão, autor no texto e fotos contadas', () => {
  const siteIds = new Map([[1, 's1']]);
  const result = mapDiaryEntries([
    { id: 1, projeto_id: 1, data: '2026-10-20', titulo: '', texto: 'Betonagem', autor: 'Autor Teste', criado_em: '2026-10-20T17:00:00.000Z' },
    { id: 2, projeto_id: 1, data: '2026-10-21', titulo: 'Longo', texto: 'y'.repeat(12_000), autor: '', criado_em: '2026-10-21 08:30:00' },
    { id: 3, projeto_id: 1, data: '21/10/2026', titulo: 'Data má', texto: '' },
    { id: 4, projeto_id: 5, data: '2026-10-21', titulo: 'Sem obra', texto: '' }
  ], siteIds, new Map([[1, 3], [3, 2]]));

  assert.equal(result.entries.length, 2);
  const [first, second] = result.entries;
  assert.equal(first.title, DIARY_DEFAULT_TITLE);
  assert.equal(first.body, 'Betonagem\n\n— Autor no Lyrical: Autor Teste');
  assert.equal(first.createdAt, '2026-10-20T17:00:00.000Z');
  assert.equal(second.body.length, 10_000);
  assert.equal(second.createdAt, '2026-10-21T08:30:00.000Z');
  assert.ok(Number.isNaN(parseUtcTimestamp('')));
  assert.ok(Number.isNaN(parseUtcTimestamp('ontem')));
  assert.equal(result.photosSkipped, 5);
  assert.equal(result.entriesWithPhotos, 2);
  assert.deepEqual(result.rejected.map((r) => `${r.id}:${r.reason}`), ['3:data-invalida', '4:obra-inexistente']);
  assert.deepEqual(result.transformations, { untitled: 1, titlesTruncated: 0, bodiesTruncated: 1, authorKeptInBody: 1 });
});

// --- base SQLite sintética, com o esquema do Lyrical reduzido ao que o importador lê --------------------

const CORE_SCHEMA = `
  CREATE TABLE trabalhadores (id INTEGER PRIMARY KEY, numero_mecanografico TEXT NOT NULL, nome TEXT NOT NULL,
    categoria TEXT, contacto TEXT, tamanho_tshirt TEXT, tamanho_sweat TEXT, tamanho_calcas TEXT,
    tamanho_botas TEXT, tamanho_parka TEXT);
  CREATE TABLE projetos (id INTEGER PRIMARY KEY, codigo_pep TEXT NOT NULL, descricao TEXT, limite_horas REAL,
    latitude REAL, longitude REAL, morada TEXT, data_inicio TEXT, data_fim TEXT, data_previsao_fim TEXT, ordem TEXT);
  CREATE TABLE equipas (id INTEGER PRIMARY KEY, nome TEXT NOT NULL);
  CREATE TABLE escalas_semanais (id INTEGER PRIMARY KEY, equipa_id INTEGER, semana_inicio TEXT NOT NULL,
    projeto_id INTEGER, dias TEXT NOT NULL DEFAULT '12345');
  CREATE TABLE escala_trabalhadores (escala_id INTEGER NOT NULL, trabalhador_id INTEGER NOT NULL);
`;

const NEW_MODULES_SCHEMA = `
  CREATE TABLE ferias (id INTEGER PRIMARY KEY, trabalhador_id INTEGER NOT NULL, data_inicio TEXT NOT NULL,
    data_fim TEXT NOT NULL, observacoes TEXT);
  CREATE TABLE ausencias (id INTEGER PRIMARY KEY, trabalhador_id INTEGER NOT NULL, tipo TEXT NOT NULL,
    data_inicio TEXT NOT NULL, data_fim TEXT NOT NULL, observacoes TEXT, criado_em TEXT);
  CREATE TABLE hoteis (id INTEGER PRIMARY KEY, projeto_id INTEGER NOT NULL, nome TEXT NOT NULL, morada TEXT,
    contacto TEXT, notas TEXT, criado_em TEXT);
  CREATE TABLE dormidas (id INTEGER PRIMARY KEY, trabalhador_id INTEGER NOT NULL, projeto_id INTEGER NOT NULL,
    hotel_id INTEGER, semana_inicio TEXT NOT NULL, entrada TEXT NOT NULL, saida TEXT NOT NULL, observacoes TEXT);
  CREATE TABLE relatorios (id INTEGER PRIMARY KEY, projeto_id INTEGER NOT NULL, data TEXT NOT NULL,
    titulo TEXT NOT NULL DEFAULT '', texto TEXT NOT NULL DEFAULT '', autor TEXT NOT NULL DEFAULT '', criado_em TEXT NOT NULL);
  CREATE TABLE relatorio_fotos (id INTEGER PRIMARY KEY, relatorio_id INTEGER NOT NULL, ficheiro TEXT NOT NULL,
    nome_original TEXT NOT NULL DEFAULT '', tipo TEXT NOT NULL DEFAULT 'image/jpeg', bytes INTEGER NOT NULL DEFAULT 0,
    ordem INTEGER NOT NULL DEFAULT 0);
`;

function fixtureDb({ newModules = true } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(CORE_SCHEMA);
  db.exec(`
    INSERT INTO trabalhadores (id, numero_mecanografico, nome, categoria) VALUES
      (1, '001', 'Pessoa Ficticia Um', 'Pedreiro'), (2, '002', 'Pessoa Ficticia Dois', NULL);
    INSERT INTO projetos (id, codigo_pep, descricao, limite_horas) VALUES (1, 'P-1', 'Obra Ficticia', 100);
    INSERT INTO equipas (id, nome) VALUES (1, 'EQUIPA 1');
    INSERT INTO escalas_semanais (id, equipa_id, semana_inicio, projeto_id) VALUES (1, 1, '2026-10-19', 1);
    INSERT INTO escala_trabalhadores (escala_id, trabalhador_id) VALUES (1, 1), (1, 2);
  `);
  if (newModules) {
    db.exec(NEW_MODULES_SCHEMA);
    db.exec(`
      INSERT INTO ferias (id, trabalhador_id, data_inicio, data_fim) VALUES (1, 1, '2026-08-03', '2026-08-14');
      INSERT INTO ausencias (id, trabalhador_id, tipo, data_inicio, data_fim, observacoes) VALUES
        (1, 2, 'baixa', '2026-09-01', '2026-09-03', 'Nota ficticia'),
        (2, 2, 'licenca', '2026-09-10', '2026-09-05', NULL);
      INSERT INTO hoteis (id, projeto_id, nome) VALUES (1, 1, 'Hotel Ficticio'), (2, 1, 'HOTEL FICTÍCIO');
      INSERT INTO dormidas (id, trabalhador_id, projeto_id, hotel_id, semana_inicio, entrada, saida) VALUES
        (1, 1, 1, 2, '2026-10-19', '2026-10-19', '2026-10-23'),
        (2, 2, 1, NULL, '2026-10-19', '2026-10-23', '2026-10-23');
      INSERT INTO relatorios (id, projeto_id, data, titulo, texto, autor, criado_em) VALUES
        (1, 1, '2026-10-20', 'Cofragem', 'Texto ficticio', 'Autor Ficticio', '2026-10-20T17:00:00.000Z');
      INSERT INTO relatorio_fotos (relatorio_id, ficheiro) VALUES (1, 'foto-ficticia-1.jpg'), (1, 'foto-ficticia-2.jpg');
    `);
  }
  return db;
}

test('base completa: plano, resumo sem dados pessoais e SQL com os módulos novos', () => {
  const db = fixtureDb();
  const { plan, summary } = readLyricalDatabase(db, { today: '2026-10-21' });
  db.close();

  assert.equal(summary.importNow.absences, 2);
  assert.deepEqual(summary.importNow.absencesByKind, { VACATION: 1, SICK: 1 });
  assert.equal(summary.importNow.hotels, 1);
  assert.equal(summary.importNow.stays, 1);
  assert.equal(summary.importNow.diaryEntries, 1);
  assert.deepEqual(summary.notImported, {
    ausencias: { 'fim-antes-do-inicio': { count: 1, ids: [2] } },
    dormidas: { 'saida-nao-posterior-a-entrada': { count: 1, ids: [2] } }
  });
  assert.equal(summary.transformations.hotels.mergedDuplicateNames, 1);
  assert.equal(summary.transformations.photos.diaryPhotosExcluded, 2);
  assert.equal(summary.source.diaryPhotos, 2);
  assert.equal(plan.stays[0].hotelId, plan.hotels[0].id);

  const printed = JSON.stringify(summary);
  for (const personal of ['Pessoa Ficticia', 'Nota ficticia', 'Autor Ficticio', 'Hotel Ficticio', 'Texto ficticio']) {
    assert.equal(printed.includes(personal), false, `o resumo não pode conter "${personal}"`);
  }

  const built = buildImportSql({
    email: 'dono@example.test',
    displayName: 'Dono Ficticio',
    organizationName: 'Empresa Ficticia',
    ...plan
  });
  assert.match(built.sql, /INSERT INTO absences[\s\S]*'SICK'[\s\S]*'APPROVED'/);
  assert.match(built.sql, /INSERT INTO hotels[\s\S]*'Hotel Ficticio'/);
  assert.match(built.sql, /INSERT INTO stays[\s\S]*'2026-10-19'::date/);
  assert.match(built.sql, /INSERT INTO diary_entries[\s\S]*'MANAGER', '2026-10-20T17:00:00.000Z'::timestamptz/);
  assert.match(built.sql, /RAISE EXCEPTION 'Contagem inesperada em diary_entries\.'/);
  assert.equal(built.sql.includes('foto-ficticia'), false);
  assert.equal(built.sql.includes('diary_photos'), false);
  assert.equal((built.sql.match(/INSERT INTO absences/g) || []).length, 2);
  assert.ok(built.sql.indexOf('INSERT INTO stays') > built.sql.indexOf('INSERT INTO hotels'));
  assert.ok(built.sql.trimEnd().endsWith(');'));
});

test('base antiga sem os módulos novos continua a importar', () => {
  const db = fixtureDb({ newModules: false });
  const { plan, summary } = readLyricalDatabase(db, { today: '2026-10-21' });
  db.close();
  assert.equal(summary.importNow.employees, 2);
  assert.equal(summary.importNow.absences, 0);
  assert.equal(summary.importNow.diaryEntries, 0);
  assert.deepEqual(summary.notImported, {});
  const built = buildImportSql({ email: 'a@example.test', displayName: 'A', organizationName: 'B', ...plan });
  assert.equal(built.sql.includes('INSERT INTO absences'), false);
});
