-- F8.7: o livro de horas do RH (mensal) usa a mesma fila de exportações que o mapa semanal.
-- O livro não tem modelo: template fica nulo e obrigatório só para o mapa semanal.

ALTER TABLE report_exports DROP CONSTRAINT report_exports_kind_check;
ALTER TABLE report_exports ADD CONSTRAINT report_exports_kind_check CHECK (kind IN ('WEEKLY_MAP', 'HR_BOOK'));

ALTER TABLE report_exports ALTER COLUMN template DROP NOT NULL;
ALTER TABLE report_exports DROP CONSTRAINT report_exports_template_check;
ALTER TABLE report_exports ADD CONSTRAINT report_exports_template_check
    CHECK (template IS NULL OR template IN ('EQUIPA', 'OBRA', 'HORAS', 'ERP'));
ALTER TABLE report_exports ADD CONSTRAINT report_exports_kind_template_ck
    CHECK ((kind = 'WEEKLY_MAP') = (template IS NOT NULL));
