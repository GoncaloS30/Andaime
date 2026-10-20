import assert from 'node:assert/strict';
import test from 'node:test';

import { mapEmployee, mapSite, selectCurrentTeamMemberships, sql, uniqueCode } from './lyrical-import.mjs';

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
