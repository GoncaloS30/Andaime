-- Tipo de ausência "Licença" (parental, casamento, luto…), que o Lyrical tinha e o SaaS ainda não.

ALTER TABLE absences DROP CONSTRAINT absences_kind_check;
ALTER TABLE absences ADD CONSTRAINT absences_kind_check
    CHECK (kind IN ('VACATION', 'SICK', 'TRAINING', 'PERSONAL', 'LEAVE', 'OTHER'));
