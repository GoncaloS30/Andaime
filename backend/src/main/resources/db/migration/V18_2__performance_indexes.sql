-- F7: índices encontrados no teste de carga (1000 trabalhadores, 90 dias) e na revisão das consultas.
-- Versão 18.2 para não colidir com as migrations V19+ da F6, feita em paralelo.

-- Contagem de revisões por registo de horas (subconsulta por linha nas listas de horas).
CREATE INDEX time_entry_revisions_entry_idx ON time_entry_revisions (organization_id, time_entry_id);
-- Último toque de ponto do trabalhador (validação dos toques sem rede) e idempotência por trabalhador.
CREATE INDEX clock_events_employee_time_idx ON clock_events (organization_id, employee_id, occurred_at DESC);
-- Registos ligados a uma atribuição (presença confirmada, planeado vs. registado).
CREATE INDEX time_entries_assignment_idx ON time_entries (organization_id, assignment_id) WHERE assignment_id IS NOT NULL;
-- Versões de um documento.
CREATE INDEX document_versions_document_idx ON document_versions (organization_id, document_id, uploaded_at DESC);
-- Ausências de um trabalhador (impacto, conflitos de planeamento).
CREATE INDEX absences_org_employee_idx ON absences (organization_id, employee_id, starts_on);
