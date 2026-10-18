# ADR-0010: Modelo de tempo, fusos horários e política laboral configurável

**Estado:** Aceite · **Data:** 2026-10-18

## Contexto
O protótipo guarda horas como texto sem fuso, ignora `Site.timezone`, não suporta turnos noturnos nem feriados e calcula horas extra com uma regra fixa (acima de 8 h/dia e todo o fim de semana; códigos de atividade com 8 h/9 h fixos). A empresa tem trabalhadores destacados em França, Bélgica e Alemanha.

## Decisão
- **Horas previstas ≠ horas realizadas.** Uma atribuição nunca gera horas trabalhadas.
- **Planeamento** em hora civil local da obra (data + hora local + fuso IANA da obra), com `tstzrange` derivado para verificar sobreposições. Horas locais inexistentes (salto de hora de verão) são rejeitadas com erro de validação; horas ambíguas usam a primeira ocorrência e ficam registadas.
- **Registo de horas** em instantes `timestamptz` (UTC) + fuso da obra; `work_date` é a data local de entrada. Turnos noturnos permitidos (`clock_out > clock_in`). Pausas em tabela própria, sempre dentro do registo. Nenhum par de registos não anulados do mesmo trabalhador se pode sobrepor (exclusion constraint) — impossível contar o mesmo período duas vezes.
- **Eventos de ponto brutos** (`clock_events`) são guardados só por acrescento, com hora do dispositivo, hora do servidor e chave de idempotência — é o original que fica preservado.
- **Correções** nunca reescrevem: cada alteração cria uma `time_entry_revision` com o estado anterior, autor e motivo. Folhas aprovadas estão bloqueadas por trigger; alterar exige reabrir (registado e auditado).
- **Durações em minutos inteiros** em toda a API e base de dados (sem floats de horas).
- **Política laboral por empresa e país** (`labor_policies`, com período de vigência): normal diário e semanal, dias de descanso, feriados como descanso, escalões de horas extra com código ERP (substitui os 800/801/802 fixos), pausa automática e limiar, atribuição de turnos noturnos (dia de início ou divisão à meia-noite), arredondamento. Feriados públicos por país/região e feriados da empresa.
- Valores iniciais (PT: 8 h/dia, 40 h/semana, sábado e domingo de descanso) são **sugestões a validar juridicamente** por cada empresa; o produto não declara conformidade legal.

## Consequências
- O cálculo de horas normais/extra é feito no servidor com a política em vigor na data e país da obra; os mapas semanais e exportações ERP usam esse cálculo.
- Testes obrigatórios: DST (março/outubro em Lisboa, Paris, Berlim), turno noturno, trabalho em duas obras no mesmo dia, períodos sobrepostos rejeitados, semana com feriado, limite semanal (ex.: 35 h FR).
