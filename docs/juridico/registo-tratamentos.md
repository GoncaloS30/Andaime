# Registo das atividades de tratamento — base técnica (RGPD, art. 30.º)

> Rascunho a validar juridicamente. Cada empresa cliente adapta as finalidades e os fundamentos à sua realidade; o
> Andaime fornece esta base por ser quem conhece o que o sistema guarda.

## A. Do lado da empresa cliente (responsável pelo tratamento)

| # | Atividade | Titulares | Dados (tabelas) | Finalidade | Fundamento provável (a validar) |
|---|---|---|---|---|---|
| 1 | Ficha do trabalhador | Trabalhadores, ex-trabalhadores | Nome, número interno, categoria, telefone, email, nacionalidade, localidade de residência, data de admissão, capacidade diária, custo/hora, competências, tamanhos de fardamento, notas, fotografia (`employees`, `employee_contracts`) | Gestão do pessoal, planeamento, fardamento/EPI | Execução do contrato de trabalho (art. 6.º, n.º 1, b)); obrigação legal para parte dos dados (c)) |
| 2 | Planeamento | Trabalhadores | Atribuições dia/obra/horário/viatura, equipa, responsável (`assignments`, `team_members`, `team_vehicle_links`, `planning_change_*`) | Organização do trabalho e das deslocações | Execução do contrato; interesse legítimo (f)) |
| 3 | Registo de tempos de trabalho | Trabalhadores | Picagens (hora do servidor e do dispositivo), registos, pausas, correções com motivo, folhas semanais e decisões (`clock_events`, `time_entries`, `time_entry_revisions`, `timesheets`) | Registo legal de tempos, horas extra, aprovação | Obrigação legal (Código do Trabalho, art. 202.º) e execução do contrato |
| 4 | Ausências | Trabalhadores | Tipo (férias, **doença**, formação, pessoal, outra), datas, parcial, nota, decisão (`absences`) | Gestão de férias e faltas, impacto no planeamento | Execução do contrato / obrigação legal; **"doença" é dado de saúde (art. 9.º)** — ver nota 1 |
| 5 | Documentos do trabalhador | Trabalhadores | Ficheiros e validades: identificação, **ficha de aptidão médica**, formação, A1, carta de condução (`documents`, `document_versions`, armazenamento S3) | Cumprimento de requisitos de segurança, destacamento e acesso a obras | Obrigação legal (SST, destacamento); **aptidão médica = dado de saúde (art. 9.º, n.º 2, b) e h))** |
| 6 | Fardamento e EPI | Trabalhadores | Entregas, devoluções, unidades com número de série (`equipment_movements`, `equipment_units`) | Obrigações de segurança e controlo de material | Obrigação legal (SST) |
| 7 | Obras, clientes e ocorrências | Contactos de clientes, autores das ocorrências | Nome e contactos do cliente, morada e coordenadas da obra, fotografia, ocorrências com autor (`clients`, `sites`, `site_issues`) | Gestão das obras | Execução de contrato com o cliente; interesse legítimo |
| 8 | Viaturas | Condutores (indireto) | Matrícula, seguro, inspeção, indisponibilidades, ligação a equipas | Gestão da frota e deslocações | Interesse legítimo; obrigação legal (seguro/inspeção) |
| 9 | Mapas, relatórios e exportações | Trabalhadores | Factos de horas aprovadas e de estado documental; ficheiros XLSX (`reporting_*`, `report_exports`) | Faturação ao cliente, ERP, controlo de custos | Execução de contratos; interesse legítimo |
| 10 | Notificações | Utilizadores | Avisos na aplicação e por email (`notifications`) | Informar decisões e prazos | Execução do contrato; interesse legítimo (o email pode ser desligado) |

**Notas**

1. **Dados de saúde.** "Doença" nas ausências e a ficha de aptidão médica são categorias especiais. Proposta técnica:
   (a) o tipo "doença" não guarda diagnóstico (só o tipo e as datas; a nota é livre — orientar a empresa a não escrever
   diagnósticos); (b) restringir quem vê o tipo de ausência e a ficha de aptidão a gestores — hoje o encarregado vê
   ausências das suas equipas e documentos no seu âmbito; **a decidir**.
2. **Nacionalidade.** Necessária para destacamento e documentação por país; não revela, por si, origem étnica, mas deve
   ser limitada a quem precisa (o encarregado já não a vê).
3. **Fotografia.** Usada só para identificação visual; não há reconhecimento facial nem tratamento biométrico
   (art. 4.º, n.º 14). É opcional.
4. **Não há** geolocalização de trabalhadores (as coordenadas são das obras), nem registo de IP ou de agente do
   utilizador nas tabelas de negócio.

**Destinatários:** utilizadores da empresa conforme o papel (dono, administrador, gestor, encarregado, trabalhador —
âmbitos em [../backend/seguranca.md](../backend/seguranca.md)); suporte do Andaime **só** com acesso temporário,
só de leitura, autorizado pela empresa e auditado; subcontratantes ulteriores de alojamento e email.

**Medidas de segurança (art. 32.º):** isolamento por empresa no URL e por RLS no PostgreSQL; papéis e âmbitos
verificados no servidor; palavras-passe com Argon2id; sessões HttpOnly com CSRF; limite de tentativas; ficheiros em
armazenamento privado servidos só após autorização, com tipo verificado e antivírus (ClamAV); auditoria só de
acrescento; backups com restauro testado; anonimização de ex-trabalhadores. Ver [../backend/seguranca.md](../backend/seguranca.md)
e [../operacao/](../operacao/).

## B. Do lado do Andaime

| # | Atividade | Titulares | Dados | Finalidade | Papel / fundamento provável |
|---|---|---|---|---|---|
| A1 | Contas e autenticação | Utilizadores | Email, nome, hash da palavra-passe, verificação de email, sessões, bloqueios por tentativas falhadas (`users`, `spring_session*`, `login_throttle`, tokens) | Acesso seguro ao serviço | Responsável; execução do contrato de serviço e interesse legítimo (segurança) |
| A2 | Auditoria e segurança | Utilizadores | Quem fez o quê e quando, com diferenças mínimas (`audit_event`) | Prova de alterações, deteção de abusos | Responsável (segurança) e subcontratante (auditoria da empresa) |
| A3 | Suporte | Utilizadores, dados da empresa | Pedidos de acesso de suporte e o que foi consultado (`support_access_grants`, auditoria) | Apoio técnico autorizado | Subcontratante, por instrução da empresa |
| A4 | Administração da plataforma | Empresas, utilizadores | Estado das empresas, administradores da plataforma | Operação do serviço | Responsável |
| A5 | Emails transacionais | Utilizadores | Endereço e conteúdo dos emails (verificação, convites, avisos) | Funcionamento do serviço | Responsável/subcontratante; fornecedor de email = subcontratante ulterior |
