-- Fim contratual da obra (o que foi acordado com o cliente), separado da previsão de fim (end_date, o que se espera
-- agora). Quando a previsão passa o fim contratual, a API devolve o atraso em dias úteis (SiteSchedule).

ALTER TABLE sites
    ADD COLUMN contract_end_date date,
    ADD CONSTRAINT sites_contract_end_ck CHECK (contract_end_date IS NULL OR start_date IS NULL OR contract_end_date >= start_date);
