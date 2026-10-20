-- Dados de carga para a empresa de demonstração (só bases de dados de desenvolvimento/teste):
-- 1000 trabalhadores em 50 equipas, 20 obras, 90 dias de planeamento (dias úteis) e 30 dias de registos de horas.
-- Corre como superutilizador (insere direto, sem passar pela API); os triggers calculam períodos e validações.
\set ON_ERROR_STOP on
BEGIN;
SELECT id AS org FROM organizations WHERE name LIKE 'Construções Ribeira Alta%' LIMIT 1 \gset
SELECT id AS owner FROM users WHERE email = 'demo@andaime.test' \gset
SELECT set_config('app.org_id', :'org', true);

INSERT INTO sites (organization_id, code, name, country, timezone, status, start_date, hour_limit_min, color)
SELECT :'org', 'OB-CG-' || lpad(n::text, 3, '0'), 'Obra de carga ' || n, 'PT', 'Europe/Lisbon', 'ACTIVE', current_date - 120, 600000, '#2a78d6'
FROM generate_series(1, 20) n;

INSERT INTO employees (organization_id, number, full_name, category, status)
SELECT :'org', 'C' || n, 'Trabalhador de carga ' || n, CASE WHEN n % 20 = 1 THEN 'Encarregado' ELSE 'Servente' END, 'ACTIVE'
FROM generate_series(1, 1000) n;

INSERT INTO teams (organization_id, name, color)
SELECT :'org', 'Equipa de carga ' || n, '#3f8a2a' FROM generate_series(1, 50) n;

INSERT INTO team_members (organization_id, team_id, employee_id, joined_on)
SELECT :'org', team.id, employee.id, current_date - 120
FROM (SELECT id, row_number() OVER (ORDER BY number::text) AS rn FROM employees WHERE organization_id = :'org' AND number LIKE 'C%') employee
JOIN (SELECT id, row_number() OVER (ORDER BY name) AS rn FROM teams WHERE organization_id = :'org' AND name LIKE 'Equipa de carga%') team
  ON team.rn = (employee.rn - 1) / 20 + 1;

-- Planeamento: cada equipa numa obra, dias úteis de -30 a +60 dias.
INSERT INTO assignments (organization_id, employee_id, site_id, work_date, start_time, end_time, break_min, planned_min,
                         site_timezone, period, team_id, is_foreman, created_by_user_id)
SELECT :'org', member.employee_id, site.id, day::date, '08:00', '17:00', 60, 480, '', 'empty', member.team_id,
       employee.category = 'Encarregado', :'owner'
FROM team_members member
JOIN employees employee ON employee.id = member.employee_id AND employee.number LIKE 'C%'
JOIN (SELECT id, row_number() OVER (ORDER BY name) AS rn FROM teams WHERE organization_id = :'org' AND name LIKE 'Equipa de carga%') team
  ON team.id = member.team_id
JOIN (SELECT id, row_number() OVER (ORDER BY code) AS rn FROM sites WHERE organization_id = :'org' AND code LIKE 'OB-CG-%') site
  ON site.rn = (team.rn - 1) % 20 + 1
CROSS JOIN generate_series(current_date - 30, current_date + 60, interval '1 day') day
WHERE extract(isodow FROM day) < 6;

-- Registos de horas dos dias úteis passados (fechados).
INSERT INTO time_entries (organization_id, employee_id, site_id, assignment_id, work_date, timezone, started_at, ended_at,
                          break_min, worked_min, status, source, created_by_user_id)
SELECT :'org', assignment.employee_id, assignment.site_id, assignment.id, assignment.work_date, 'Europe/Lisbon',
       lower(assignment.period), upper(assignment.period), 60, 480, 'CLOSED', 'FOREMAN', :'owner'
FROM assignments assignment JOIN employees employee ON employee.id = assignment.employee_id AND employee.number LIKE 'C%'
WHERE assignment.organization_id = :'org' AND assignment.work_date < current_date;
COMMIT;
ANALYZE;
SELECT (SELECT count(*) FROM employees) AS employees, (SELECT count(*) FROM assignments) AS assignments,
       (SELECT count(*) FROM time_entries) AS time_entries;
