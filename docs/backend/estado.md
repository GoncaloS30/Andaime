# Estado da migração para SaaS

> Documento vivo. Atualizado no fim de cada fase e sub-entrega. Serve também de briefing para continuar o trabalho noutra sessão/assistente.

Plano completo: secções "Arquitetura", "Modelo", "Endpoints" e "Sequência" em [arquitetura.md](arquitetura.md), [modelo-dados.md](modelo-dados.md), [api.md](api.md) e ADRs 0006–0011.

## Decisões fechadas

- Monorepo: frontend na raiz; `backend/` (Maven, Java 21, Spring Boot 4.1.1, Modulith 2.1.1, springdoc 3.1); `infra/` (Docker Compose).
- Docker só existe no WSL Ubuntu → build e testes do backend correm no WSL com JDK 21 (o CI e a imagem Docker usam a mesma versão).
- Autenticação por sessões Spring Security + Spring Session JDBC.
- Modo demo removido da aplicação; o protótipo antigo foi apagado em F6.
- Portas: Postgres **55442**, API **8088**, Mailpit **51035** (SMTP) / **58035** (UI), armazenamento S3 **59010** (F5). Nunca tocar nos contentores do projeto Mesa (8081, 55432, 51025, 58025) nem nos volumes `infra_*`.

## Fases

| Fase | Estado |
|---|---|
| F0 — Auditoria e arquitetura | ✅ ADRs 0006–0011 e `docs/backend/*` |
| F1 — Fundação SaaS | ✅ concluída em 2026-10-19 |
| F2 — Trabalhadores, obras, equipas | ✅ concluída em 2026-10-19 |
| F3 — Planeamento e viaturas | ✅ concluída em 2026-10-19 |
| F4 — Horas e aprovações | ✅ concluída em 2026-10-19 |
| F5 — Documentos, ausências, equipamentos, notificações | ✅ concluída em 2026-10-19 |
| F6 — Mapas e relatórios | ✅ concluída em 2026-10-20 |
| F7 — Hardening | ✅ concluída em 2026-10-20 (lote A: produto e segurança; lote B: operação e qualidade) |

## Ajustes ao plano

- Fixtures partilhadas vitest/JUnit (exportadas da semente) passam de F0 para a fase em que cada regra é portada (F3 conflitos, F4 horas), onde são usadas.
- Acesso de suporte do Platform Admin a dados de uma empresa (`support_access_grants`) passa para F7; em F1 o Platform Admin só lista/suspende organizações.

## F1 — subentregas

### Fundação executável e schema (concluída em 2026-10-18)

- Maven wrapper, Java 21, Spring Boot 4.1.1, Spring Modulith 2.1.1, springdoc e Testcontainers 2.
- Perfis `local`, `test` e `prod`; logs ECS JSON com `X-Request-Id`; Actuator; JAR e imagem Docker sem utilizador root.
- Compose `andaime` com PostgreSQL 18 (`55442`), Mailpit (`51035`/`58035`) e API (`8088`). O mount usa `/var/lib/postgresql`, como exigido pela imagem oficial 18+.
- Migrações Flyway V1–V11: extensões/funções, Spring Session, identidade, organizações e memberships, convites, tokens/throttling, auditoria, outbox Modulith, idempotência, políticas e acesso de suporte.
- RLS ativa e forçada nas tabelas de tenant; papel de runtime sem propriedade de objetos; auditoria só por acrescento; `TenantAwareJpaTransactionManager` aplica `app.org_id` e `app.user_id` localmente em cada transação.
- Módulos iniciais `identity`, `organization`, `platform`, `policy`, `audit` e `shared`, com verificação Modulith.

Verificação real:

```text
./mvnw verify
Tests run: 10, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS

GET http://localhost:8088/actuator/health/readiness
{"status":"UP"}
```

O WSL tinha apenas o runtime Java 25, sem `javac`; foi instalado `openjdk-21-jdk-headless`. Até o Java 21 ser selecionado por omissão, usar `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64` nos comandos.

### Identidade, sessão e onboarding (concluída em 2026-10-18)

- Registo com palavra-passe Argon2id, token de verificação aleatório de 32 bytes e apenas o respetivo SHA-256 persistido; respostas neutras para contas já existentes.
- Verificação de email, login e logout com Spring Security; sessão JDBC no cookie `ANDAIME_SESSION` (`HttpOnly`, `SameSite=Lax`, `Secure` em produção).
- CSRF em modo SPA: `GET /api/auth/csrf` emite `XSRF-TOKEN` e as mutações validam `X-XSRF-TOKEN`.
- Bloqueio por email após cinco logins inválidos, com espera exponencial de 30 segundos até 15 minutos e resposta 429 com `Retry-After`.
- `GET /api/me` e `POST /api/orgs`; o onboarding cria UUIDv7, membership OWNER, política laboral, nove regras de conflito, organização ativa e evento de auditoria numa única transação.
- Migração V12 permite ao utilizador descobrir as organizações onde tem membership ativa sem abrir permissões de escrita fora do tenant corrente.
- Erros HTTP normalizados em `application/problem+json`, com `code`, `requestId` e detalhes de validação.

Verificação real desta subentrega:

```text
./mvnw verify
Tests run: 14, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS

GET http://localhost:8088/actuator/health/readiness
{"status":"UP"}

Flyway: schema public atualizado de V11 para V12
```

### Perfil, passwords e sessões (concluída em 2026-10-18)

- Recuperação de palavra-passe com resposta neutra, token de utilização única válido por uma hora e revogação de todas as sessões após o reset.
- Alteração autenticada da palavra-passe, validando a atual e preservando apenas a sessão corrente.
- Edição de nome/locale e seleção da organização ativa, recusando organizações sem membership ativa com 404.
- Listagem e revogação de sessões Spring Session; os IDs devolvidos pela API são hashes opacos e não os identificadores que autenticam os cookies.
- Testes HTTP usam o cookie/cabeçalho CSRF reais e cobrem token não reutilizável, passwords antigas recusadas e revogação de sessões.

Verificação real acumulada:

```text
./mvnw verify
Tests run: 15, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

### Organizações, convites, plataforma e frontend real (concluída em 2026-10-19)

Backend:
- `OrganizationAccessFilter`: todos os pedidos `/api/orgs/{orgId}/…` validam a membership ativa (404 se não for membro, 403 `organization-suspended` se suspensa) e passam o papel ao backend (`OrgRole.require`).
- Organização: `GET`/`PATCH` com `version`; membros: listar, mudar papel (regras OWNER/ADMIN), retirar acesso; o último OWNER é protegido com bloqueio da linha da organização.
- Convites: criar (substitui o pendente), listar, cancelar, reenviar; pré-visualização pública por token; aceitação exige o mesmo email e bloqueia o convite (sem aceitação dupla). V13: função `SECURITY DEFINER` mínima para ler o convite antes de existir membership.
- Auditoria de negócio (`AuditLog`, na mesma transação) e `GET /api/orgs/{orgId}/audit` paginado.
- Plataforma: pool próprio `andaime_platform`; listar, suspender e reativar empresas, com auditoria `on_behalf`.
- Limite por IP nos endpoints públicos de autenticação (429 + `Retry-After`), duração absoluta da sessão (7 dias), 403 com `code` (`csrf`/`forbidden`) e o principal da sessão já não guarda o hash da palavra-passe.

Frontend (`src/saas/`):
- Cliente HTTP na mesma origem com CSRF e erros RFC 9457 (`src/saas/api/http.ts`), TanStack Query atrás de uma fachada de hooks (`src/saas/api/hooks.ts`); as chaves de empresa começam por `['org', orgId]` e mudar de empresa limpa-as.
- Ecrãs reais: entrar, registar, confirmar email, recuperar e repor palavra-passe, convite, criar empresa, troca de empresa, Definições (empresa, equipa e acessos, a minha conta com sessões, auditoria) e administração da plataforma.
- A experiência vem da membership: OWNER/ADMIN/MANAGER → gestor; FOREMAN → encarregado; WORKER → `/app`. As áreas de outro papel redirecionam.
- Módulos ainda não ligados mostram "Ainda não ligado ao servidor" com a fase prevista — sem dados fictícios.
- Modo demo fora da aplicação: guião, palco, menu Demonstração e seletor de papel não existem no build real. O protótipo antigo só arranca nos modos `e2e`/`prototipo` (testes dos módulos por migrar) e não entra no build de produção (verificado: 0 ocorrências da empresa fictícia em `dist/`).

Verificação real:

```text
./mvnw verify (WSL, JDK 21, PostgreSQL 18 via Testcontainers)
FoundationIntegrationTest 12 · OrganizationIntegrationTest 3 (inclui a suite IDOR sobre todas as rotas /api/orgs/{orgId}) ·
ModularityTest 1 · TenantContextTest 2 · AuthRateLimitFilterTest 1  → 19 testes, 0 falhas, BUILD SUCCESS

npm run typecheck · npm run lint → sem erros
npm test → 34 ficheiros, 182 testes, todos a passar
npm run e2e:saas → 1 passed (10 s): registo + email real (Mailpit) + confirmação + criar empresa + convite +
  aceitação por outra conta + papel de encarregado + auditoria + sair
```

### Ainda não feito em F1 (passa para fases seguintes)

- Job de CI para o E2E full-stack (precisa de Compose no runner); hoje corre localmente com `npm run e2e:saas`.
- Acesso de suporte do Platform Admin a dados de uma empresa (F7).
- Tipos TypeScript gerados do OpenAPI (F2, quando a API crescer).
- Ligação de uma conta WORKER à ficha de trabalhador (F2, quando existirem trabalhadores).

## F2 — Trabalhadores, obras e equipas (concluída em 2026-10-19)

Backend (`workforce`, `sites`, `devdata`):
- **V14** trabalhadores (número único por empresa, automático se vazio; competências; tamanhos), contratos sem sobreposição, equipas e `team_members` com períodos datados — um trabalhador está numa só equipa por dia (exclusion constraint) — e ligação conta ↔ ficha de trabalhador (`memberships.employee_id`).
- **V15** clientes (NIF único), obras (código `OB-AA-NNN` automático, fuso IANA validado por trigger e por defeito o do país, limite e horas históricas importadas em minutos), ocorrências de obra.
- Âmbito por papel no servidor: gestor e acima vêem tudo; o encarregado vê-se a si, os membros atuais das equipas que lidera e as obras de que é encarregado, **sem custos nem dados pessoais**; o trabalhador só a própria ficha.
- Mudanças de equipa valem de hoje em diante: entrar numa equipa fecha a anterior na véspera; datas passadas são recusadas (400 `past-date`).
- Métricas de obra calculadas no servidor (`SiteMetrics`, porta de `siteMetrics.ts`, com testes). Sem registos de horas ainda (F4), as realizadas/aprovadas vêm só do histórico importado e a API devolve `includesTimeEntries: false`; a interface diz isso.
- Auditoria em todas as alterações; dados pessoais aparecem só como "alterado". Histórico por registo (`/audit?entityType=&entityId=`) para gestores.
- Erros de base de dados traduzidos: 409 `duplicate`/`overlap`, 404 para referências inexistentes.
- Semente de demonstração explícita e idempotente (`andaime.seed.demo.enabled=true` + email e palavra-passe do dono), passa pelos serviços reais e recusa correr no perfil `prod`.
- Os testes passam a correr as migrações como `andaime_owner`, como em produção — apanhou a falta de permissões explícitas em tabelas novas.

Frontend (`src/saas/pages/workforce`, `src/saas/pages/sites`):
- Trabalhadores: lista com pesquisa, filtros e paginação no servidor; ficha (dados profissionais, percurso em equipas, contratos, histórico); criar, editar com versão, arquivar e repor.
- Equipas: lista, criação com responsável e cor, juntar/retirar elementos com data, composição ao longo do tempo, histórico, arquivar.
- Obras: cartões ou tabela com medidor de horas, nova obra com mapa para marcar a localização, ficha com métricas, localização, ocorrências e histórico, edição e arquivo; clientes; mapa de obras.
- Encarregado: "Hoje" com as suas equipas e obras; "Problemas" com as ocorrências e comunicação de novas.
- Definições → Equipa e acessos: ligar a conta de encarregados e trabalhadores à respetiva ficha.

Verificação real:

```text
./mvnw verify → 28 testes, 0 falhas (SiteMetricsTest 5 · WorkforceSitesIntegrationTest 4 · IDOR sobre todas as rotas
  /api/orgs/{orgId}, incluindo as novas · Modulith verify com os módulos workforce, sites e devdata)
npm run typecheck · npm run lint → sem erros · npm test → 182 testes
npm run e2e:saas → 2 passed (17 s): F1 + registar trabalhadores, formar equipa, obra com encarregado e métricas,
  persistência após recarregar, percurso em equipas e histórico
Semente: 1.ª execução cria a empresa; 2.ª execução "a empresa já existe; nada a fazer"
```

### Ainda não feito em F2

- Fotos de trabalhadores e obras (passam para o storage em F5).
- Viaturas e equipa/viatura por obra (F3), horas e documentos na ficha (F4/F5).
- Paginação da lista de obras (limite de 1000 por pedido; suficiente até F7).
- Tipos TypeScript gerados do OpenAPI (adiado: os contratos estão em `src/saas/api/*.ts` e cobertos por E2E).

## F3 — Planeamento e viaturas (concluída em 2026-10-19)

Backend (`fleet`, `planning`):
- **V16** viaturas (matrícula única por empresa, lotação, estado, seguro, inspeção, manutenção, km), indisponibilidades, ligação equipa ↔ viatura datada (uma viatura por equipa e uma equipa por viatura em cada dia), atribuições e change-sets.
- Atribuições guardam data e horas **locais da obra**; um trigger calcula o período absoluto (`tstzrange`) com o fuso da obra; fim ≤ início = dia seguinte (turno noturno). Horas inexistentes na mudança para a hora de verão → 400.
- Duas *exclusion constraints* diferidas garantem na base de dados que um trabalhador não está em dois sítios ao mesmo tempo e que uma viatura não está em duas obras ao mesmo tempo.
- Motor de conflitos puro (`ConflictEngine`, porta de `src/domain/conflicts.ts`): sobreposição, capacidade diária, trabalhador inativo, viatura sobreposta/indisponível/sem inspeção ou seguro/lotação, obra sem responsável, limite de horas da obra. Severidade por empresa (bloquear/avisar/desligar); sobreposições bloqueiam sempre. Cada conflito traz correções executáveis.
- Todas as alterações são **comandos** (`ASSIGN`, `SCHEDULE`, `UPDATE`, `BULK_UPDATE`, `DUPLICATE`, `DELETE`, `TRANSFER`, `COPY_WEEK`) com o mesmo pipeline numa transação: locks consultivos ordenados por trabalhador e viatura → conflitos antes → aplicar → conflitos depois → os novos decidem (bloqueante → 409 `planning-conflicts`; aviso não confirmado → 409 `confirmation-required` com os ids a confirmar) → verificação imediata das constraints.
- Pré-visualização corre o mesmo pipeline num *savepoint* e volta atrás.
- "Anular" por change-set: só desfaz se nenhuma das atribuições mudou entretanto (409 `stale`), e a anulação é ela própria auditada.
- Equipa e viatura por omissão: a equipa do trabalhador nesse dia e a viatura dessa equipa; pausa da política laboral (60 min acima de 6 h).
- Métricas de obra passam a incluir as horas planeadas de hoje em diante; o encarregado vê também as obras onde as suas equipas estão planeadas.
- Semente de demonstração: uma carrinha por equipa (e uma na oficina) e esta semana e a próxima planeadas pelos mesmos comandos.

Frontend (`src/saas/pages/planning`, `src/saas/pages/fleet`):
- Planeamento semanal por trabalhador: arrastar blocos entre dias e pessoas, atribuir a partir da célula, ficha da atribuição (obra, horas, viatura, responsável, nota, retirar, copiar), "Nova escala" e "Copiar semana" com pré-visualização, painel de conflitos com correções, confirmação de avisos, "Anular" (botão e toast).
- Encarregado: "Escala da semana" só de leitura.
- Viaturas: lista com alertas de seguro/inspeção/manutenção, ficha com indisponibilidades e próximas saídas, criar/editar/arquivar; viatura da equipa na ficha da equipa.

Verificação real:

```text
./mvnw verify → 43 testes, 0 falhas (ConflictEngineTest 12 · PlanningIntegrationTest 3: comandos, pré-visualização,
  bloqueio, confirmação, anular, versões, turno noturno, DST, âmbito do trabalhador, auditoria; 2 pedidos simultâneos
  incompatíveis → exatamente um vence; viaturas, equipa/viatura, indisponibilidade, copiar semana · IDOR com as rotas novas)
npm run typecheck · npm run lint → sem erros · npm test → 182 testes
npm run e2e:saas → 3 passed: onboarding · trabalhadores/equipas/obras · planeamento (atribuir, sobreposição bloqueada,
  anular, viatura da equipa aplicada automaticamente)
Semente: cria 9 viaturas e duas semanas de planeamento
```

### Ainda não feito em F3

- Conflitos com ausências e documentos em falta (entram com F5, quando existirem esses dados).
- Vista mensal, vistas por obra/equipa/viatura e planeamento no telemóvel (o protótipo tem-nas; ficam para F7).
- Esticar uma atribuição arrastando a pega (fazer com "Nova escala" ou "Copiar").

## F4 — Horas e aprovações (concluída em 2026-10-19)

Backend (`timekeeping`):
- **V17** `clock_events` (registo bruto do ponto, só acrescento, único por trabalhador + chave de idempotência), `time_entries` (instantes `timestamptz`, fuso da obra, dia local, pausa, minutos trabalhados, origem ponto/encarregado/escritório), `time_entry_revisions` (antes/depois + motivo) e `timesheets` (trabalhador × semana ISO).
- Na base de dados: sem sobreposição de registos do mesmo trabalhador (*exclusion constraint*), no máximo um registo aberto, duração até 24 h, e **semanas aprovadas fechadas por trigger** (SQLSTATE próprio `AN001` → 409 `timesheet-locked`) até o gestor reabrir.
- Ponto: entrada/pausa/retomar/saída com chave de idempotência (repetições não duplicam), hora do servidor (a do dispositivo fica guardada), obra por omissão a do planeamento do dia, lock por trabalhador; sair durante a pausa fecha a pausa; pausa automática da política laboral quando não houve pausa.
- Registos manuais e correções (encarregado para a sua equipa, gestor para todos) sempre com motivo; o original fica numa revisão; anular em vez de apagar.
- Confirmar presença: o encarregado cria de uma vez os registos com o horário planeado de hoje da sua equipa (ignora o que já está registado ou fora da equipa).
- `HoursCalculator` (puro, com testes): normais até ao limite diário e extra acima; descanso e feriados todo extra; o limite semanal passa o excesso a extra; turnos noturnos no dia de início ou divididos à meia-noite local; mudança de hora conta as horas reais. Substitui as 8 h/9 h fixas do protótipo pela política da empresa (`labor_policies`, feriados da empresa e públicos).
- Folhas semanais: DRAFT → SUBMITTED → APPROVED, ou REJECTED (com nota) para corrigir; submeter pelo próprio, encarregado ou gestor; aprovar/devolver/reabrir só gestor, com versão e auditoria; não se submete nem aprova com entradas sem saída.
- Métricas de obra: realizadas = histórico importado + registos fechados; aprovadas = histórico aprovado + semanas aprovadas (`includesTimeEntries: true`). O limite de horas no planeamento usa também os registos.
- Semente: semana passada com registos (com algumas horas extra), folhas aprovadas, submetidas e por submeter.

Frontend (`src/saas/pages/timekeeping`):
- App do trabalhador: ponto com a obra do dia, pausa/retomar, horas e extra da semana; escolha de obra quando não há planeamento.
- Gestor `/horas`: folhas da semana (planeadas, trabalhadas, normais, extra, estado, alertas de entradas sem saída e dias planeados sem registo), aprovar em lote, ficha da semana por dia com registos, registo manual, corrigir/anular com motivo, histórico de correções, devolver e reabrir.
- Encarregado `/encarregado/horas`: presenças de hoje para confirmar de uma vez e folhas da equipa para submeter.

Verificação real:

```text
./mvnw verify → 51 testes, 0 falhas (HoursCalculatorTest 5 · TimekeepingIntegrationTest 3: ponto idempotente com pausa e saída,
  workflow completo da folha com bloqueio na base de dados e reabertura, correção com revisões, sobreposição recusada, presença
  confirmada pelo encarregado só para a sua equipa · IDOR com as rotas novas)
npm run typecheck · npm run lint → sem erros · npm test → 182 testes
npm run e2e:saas → 4 passed: + trabalhador convidado pica o ponto na app e o gestor aprova a semana, que fica fechada
Semente: 200 registos, 29 folhas aprovadas e 5 submetidas
```

### Ainda não feito em F4

- Ponto offline no telemóvel (fila local com as mesmas chaves de idempotência) — F7.
- Escalões de horas extra com códigos ERP (`overtime_tiers`) — entram com os mapas e exportações (F6).
- Edição da política laboral e dos feriados nas Definições (hoje: valores por omissão 8 h/40 h, pausa de 60 min acima de 6 h).

## F5 — Documentos, ausências, equipamentos e notificações (concluída em 2026-10-19)

Ajuste ao plano: **as imagens públicas do MinIO deixaram de ser publicadas** (Docker Hub e quay.io). O armazenamento de
desenvolvimento e de testes passa a ser o **SeaweedFS** (open source, API S3), no serviço `objectstore` do Compose
(porta 59010) e num contentor Testcontainers nos testes. O código fala S3 padrão (AWS SDK v2), por isso em produção
serve qualquer S3 (AWS, Scaleway, OVH, MinIO próprio…). O download passa sempre pela API (com verificação de acesso e
auditoria), em vez de URLs pré-assinados: os ficheiros nunca ficam acessíveis sem sessão.

Backend:
- **V18** tipos de documento (catálogo inicial por empresa, sem exigências à partida), exigências por país, documentos e
  versões (chave no armazenamento, SHA-256, tamanho, tipo detetado, validade, verificação), ausências (sem sobreposição
  de dias inteiros), artigos de EPI, saldo de stock (`CHECK on_hand >= 0`), unidades com número de série e titular,
  registo de movimentos só de acrescento, notificações; funções `app.active_org_ids()` e `app.organization_owner()`
  (SECURITY DEFINER) para as tarefas agendadas.
- `documents`: upload multipart até 15 MB com o tipo real detetado pelo conteúdo (Apache Tika; só PDF, JPEG, PNG, WebP);
  renovar = nova versão; verificação pelo gestor; conformidade por trabalhador (obrigatórios em todas as obras ou por
  país); alerta diário de validade (06:00, por empresa, com lock e deduplicação) que notifica os gestores. O ficheiro
  carregado numa transação que falha é apagado do armazenamento.
- `absences`: pedido pelo próprio (só hoje em diante), encarregado ou escritório; aprovar com trabalho planeado exige
  decidir **retirar** (change-set de planeamento, anulável) ou **manter** (fica conflito); recusar com motivo; cancelar
  sem apagar.
- Planeamento: novas regras `ABSENCE` (bloqueia por omissão) e `DOCUMENT_MISSING` (aviso, com correção "Ver documentos").
- `equipment`: entradas, acertos com motivo, entregas e devoluções (bom estado, danificado, perdido); o stock nunca fica
  negativo; uma unidade com número de série só tem um titular; o que cada pessoa tem calcula-se pelo registo.
- `notifications`: gravadas na mesma transação da alteração (pedido e decisão de ausências, documentos carregados por
  trabalhadores, validades) e sinal em tempo real por SSE depois do commit; o cliente tem consulta periódica de reserva.

Frontend (`src/saas/pages/operations`, `src/saas/shell/NotificationBell.tsx`):
- Documentos: conformidade (matriz por trabalhador e tipo, com país opcional), lista com situação, tipos e exigências,
  upload e renovação, versões com download e verificação. O encarregado vê e carrega os da sua equipa.
- Ausências: pedidos por decidir com o impacto no planeamento, registo do mês, registar em nome de alguém, cancelar.
- Fardamento e EPI: artigos com stock e alerta de mínimo, entradas, acertos, entregas, devoluções e "com quem está".
- App do trabalhador: pedir ausência e enviar os próprios documentos. Sino de notificações no cabeçalho.

Verificação real:

```text
./mvnw verify → 54 testes, 0 falhas (OperationsIntegrationTest 3: upload real para S3 com tipo detetado pelo conteúdo,
  download byte a byte, âmbito por papel, versões, verificação, conformidade, aviso no planeamento, alerta diário
  deduplicado e notificações; ausência com impacto explícito, remoção como change-set, bloqueio no planeamento,
  cancelar e recusar; stock nunca negativo, números de série únicos, devoluções e registo de movimentos)
npm run typecheck · npm run lint → sem erros · npm test → 182 testes
npm run e2e:saas → 5 passed: + documentos com ficheiro real, entregas de EPI e ausência aprovada
```

### Ainda não feito em F5

- Fotos de trabalhadores e obras no armazenamento (continuam só no protótipo; F7).
- Antivírus aos ficheiros carregados (`scan_status` existe; integração com ClamAV em F7).
- Documentos de viaturas na interface (a API já os aceita; ecrã na ficha da viatura em F7).
- Notificações por email (hoje só na aplicação).

## Depois da F7 — avisos por email, fotografias e antivírus (2026-10-20)

- **Avisos por email** (V21): ausências pedidas/decididas, folhas devolvidas e validades de documentos seguem também
  por email, só depois do commit (outbox na tabela `notifications`, reclamação `SKIP LOCKED`, recuo exponencial,
  5 tentativas). Cada utilizador liga/desliga por empresa em «A minha conta».
- **Fotografias** (V22) de trabalhadores e obras no armazenamento S3 privado, servidas pela API com o âmbito da ficha;
  tipo detetado pelo conteúdo, até 5 MB; aparecem no avatar, na ficha da obra e nos pinos do mapa. Anonimizar apaga a foto.
- **Antivírus**: cliente clamd (INSTREAM) para documentos e fotos, ligado por omissão em `prod` e com falha fechada;
  serviço `clamav` no Compose com o perfil `antivirus` (porta 59310). `ObjectStorage` passou para `shared.storage`.

Verificação real:

```text
./mvnw verify (WSL, JDK 21) → 68 testes, 0 falhas, BUILD SUCCESS
npm run typecheck → sem erros · npm run lint → sem erros · npm test → 31 testes, 0 falhas
npm run build → 2222 módulos transformados, build concluído
npm run e2e:saas → 26 passed (1.3m; fotografias de trabalhador e obra, remoção e miniatura no mapa)
EICAR enviado por INSTREAM ao clamd real → stream: Eicar-Test-Signature FOUND
```

O antivírus foi testado contra um clamd simulado (limpo, EICAR encontrado, indisponível) e manualmente contra o
ClamAV real iniciado pelo perfil Compose `antivirus`.

## F6 — Mapas e relatórios (concluída em 2026-10-20)

Feita em paralelo (ChatGPT) e integrada por Claude sobre o `main` com F7.

- Módulo Modulith `reporting` com read models SQL para mapa semanal, overview, horas aprovadas, planeado/realizado,
  viaturas, documentos e distribuição por equipa, sempre sob RLS.
- Projeções idempotentes `reporting_time_facts` e `reporting_document_facts`, alimentadas pela fachada
  `ReportingProjection`: aprovar uma folha publica os registos da semana (com a divisão normal/extra da política
  laboral, equipa histórica e código ERP); reabrir retira-os. Documentos são projetados ao carregar, verificar,
  arquivar e no job diário de validades (estados VALID, EXPIRING, EXPIRED, PENDING; trabalhadores e viaturas).
- Quatro XLSX no servidor com Apache POI SXSSF 5.5.1: equipa, obra, horas e ERP. Limite síncrono de 20 000 linhas e
  assíncrono de 200 000. Fila PostgreSQL com reclamação `SKIP LOCKED`, retoma após 15 minutos e expiração a 24 horas.
- Ecrãs reais `/mapas` e `/relatorios` (tabelas com scroll acessível por teclado).
- Migrations **V19** (`report_exports`) e **V20** (read models) — renumeradas de V17/V18 para não colidir com F4/F5.
- Importador opcional do histórico Lyrical (`npm run importar:lyrical`, ver `importacao-lyrical.md`).
- **Protótipo retirado**: `src/store`, `src/data/seed`, `src/lib/excel`, `src/features` não usados, `e2e/` antigo,
  fotos locais e dependências `exceljs`, `zustand`, `immer`, `jszip`, `date-fns`, `cmdk`, `fake-indexeddb`, `sharp`.
  `main.tsx` arranca só a aplicação real e limpa as chaves antigas do `localStorage`.

Verificação real:

```text
./mvnw verify → 62 testes, 0 falhas (inclui ReportingIntegrationTest e ReportingSourcesIntegrationTest)
npm run typecheck · npm run lint → sem erros · npm test → 31 testes · npm run test:lyrical-import → 5 testes
npm run e2e:saas → 26 passed (8 cenários + 18 ecrãs/diálogos sem violações sérias de acessibilidade)
```

## F7 — Endurecimento

### Lote A — produto e segurança (concluído em 2026-10-20)

- **Endpoints de gestão:** `/actuator/**` (exceto health) fechado na porta pública; em produção as métricas ficam na
  porta de gestão interna `ANDAIME_MANAGEMENT_PORT` (8098), que o proxy não expõe. Antes, qualquer utilizador
  autenticado de qualquer empresa podia ler `/actuator/prometheus`.
- **Notificações em tempo real:** no máximo 5 ligações SSE por utilizador (as mais antigas fecham).
- **Acesso de suporte** (adiado desde a F1): o dono ou administrador autoriza, com motivo e prazo (até 72 h), um
  administrador da plataforma; o acesso é só de leitura (escritas → 403 `support-read-only`), revogável, e cada pedido
  fica na auditoria da empresa (`support.viewed`, `support.blocked`). O suporte vê a empresa no `/api/me` com
  `supportUntil` e um aviso permanente no topo.
- **Ponto sem rede:** a app guarda os toques sem rede numa fila (só pedidos por enviar, com chave de idempotência e hora
  real) e envia-os quando a rede volta; o servidor aceita a hora do dispositivo até 72 h atrás e por ordem
  (`offline-too-old`, `offline-out-of-order`). Toques recusados ficam visíveis para a pessoa avisar o encarregado.
- **Regras da empresa:** política laboral editável (horas normais por dia e semana, dias de descanso, pausa automática,
  turnos noturnos), em vigor de hoje em diante (as semanas passadas mantêm a política anterior), e feriados próprios.
- **RGPD:** anonimizar um ex-trabalhador arquivado apaga nome, contactos, nacionalidade, morada, tamanhos, competências,
  notas, custo e contratos; ficam o número, a categoria e o histórico sem identificação; a conta ligada perde o acesso
  e os documentos ficam arquivados. Irreversível, com confirmação escrita. Prazos de retenção a validar juridicamente.
- **Documentos das viaturas** na ficha da viatura (seguro, inspeção), com upload e download.
- **V18_1** (versão 18.1, para não colidir com as V19+ da F6 em paralelo): funções `app.support_grant_active` e
  `app.support_grants_for` (SECURITY DEFINER) e `employees.anonymized_at`.

Verificação real:

```text
./mvnw verify → 59 testes, 0 falhas (HardeningIntegrationTest 5: métricas fechadas; suporte sem concessão → 404,
  com concessão lê e não escreve, auditoria e revogação; ponto sem rede com limites; política e feriados nas horas;
  anonimização)
npm run typecheck · npm run lint → sem erros · npm test → 182 testes
npm run e2e:saas → 6 passed: + regras da empresa, ponto com o navegador offline enviado quando a rede volta,
  anonimização
```

### Lote B — operação e qualidade (concluído em 2026-10-20)

- **E2E full-stack no CI** (job novo): PostgreSQL, Mailpit e SeaweedFS pelo Compose, API real com a empresa de
  demonstração e todos os testes `e2e-saas` em cada PR.
- **Acessibilidade (WCAG 2.1 AA, axe)**: 16 ecrãs do gestor + ficha do trabalhador, diálogo de escala e folha de
  horas, com a empresa de demonstração. Corrigido: nomes acessíveis dos blocos do planeamento, da troca de empresa e
  do botão de conta (texto visível incluído), links no meio do texto sublinhados, lista com scroll acessível por
  teclado, contraste nos registos da folha de horas. (O teste chegou a passar por engano no ecrã de login; agora
  confirma que está no ecrã pedido.)
- **Teste de carga** (k6, 1000 trabalhadores, 90 dias): encontrou deteção de conflitos e folhas de horas quadráticas e
  índices em falta; depois das correções, p95 do quadro 1,53 s → 0,35 s e das folhas 1,56 s → 0,30 s, 0 % de erros.
  Ver `docs/operacao/carga.md`.
- **Backups**: `scripts/ops/backup.sh` (dump custom, papéis, ficheiros, contagens, SHA-256) e
  `scripts/ops/restore-test.sh` (restauro numa base temporária com verificação de contagens, migrações, RLS e
  permissões) — executados com sucesso.
- **Runbooks** em `docs/operacao/`: deploy com checklist, migrações *expand/contract* e rollback, backups e WAL,
  incidentes (API, base de dados, suspeita de fuga entre empresas, suporte, conta comprometida, segredos).
- Respostas JSON comprimidas (gzip); **V18_2** com índices de desempenho.

Verificação real:

```text
./mvnw verify → 59 testes, 0 falhas · npm run typecheck · npm run lint → sem erros · npm test → 182 testes
npm run e2e:saas → 23 passed (7 cenários + 16 ecrãs e 1 conjunto de diálogos sem violações sérias de acessibilidade)
k6 (20 gestores, 60 s) → 0 % erros; p95 quadro 0,35 s, folhas 0,30 s, trabalhadores 0,12 s, obras 0,14 s
restore-test.sh → contagens iguais, 19 migrações, RLS e permissões ok, 103 ficheiros legíveis
```

### Planeamento mensal e para telemóvel (concluído em 2026-10-20)

- O seletor Semana/Mês usa o mesmo read model da API. O mês mostra uma linha por trabalhador e um dia por coluna,
  com cor da obra, duração, responsável e conflitos; escolher um dia abre a respetiva semana para editar.
- Em ecrãs estreitos, a grelha semanal é substituída por uma fita de sete dias e cartões agrupados por obra. É
  possível atribuir, abrir e alterar uma escala sem arrastar uma tabela horizontal; fotografias, viaturas e conflitos
  continuam visíveis.
- Não foi necessária uma migration: `/planning/board` já aceita intervalos até 92 dias. A próxima migration mantém-se
  **V23**.

### RGPD, 2FA, feriados e produção (2026-10-20)

Feito em paralelo por vários agentes e integrado/verificado por Claude.

- **Conservação de dados (V23)**: política por empresa (`/retention`) com anonimização automática de ex-trabalhadores
  arquivados (**desligada por omissão** — irreversível, cada empresa liga-a) e prazo das notificações; a anonimização
  (manual ou automática) passa a apagar os ficheiros dos documentos; job diário com limpeza global de tokens, convites
  e bloqueios antigos.
- **Exportação RGPD** (arts. 15.º e 20.º): ZIP com todos os dados do trabalhador e os seus ficheiros, pelo
  administrador ou pelo próprio («Os meus dados»); auditada.
- **Verificação em dois passos (V24)**: TOTP com códigos de recuperação, login em dois passos, segredo cifrado
  (`ANDAIME_TOTP_KEY`), política da empresa para exigir 2FA a administradores (aviso no frontend).
- **Feriados nacionais (V25)** de 12 países calculados pelo sistema e usados no cálculo de horas (país da empresa e da
  obra); lista nas Regras. Pontos a validar em [regras-por-pais.md](../juridico/regras-por-pais.md).
- **Produção**: imagem do frontend (nginx sem privilégios, CSP, proxy `/api`, SSE), `infra/compose.prod.yaml`
  (web, backend, PostgreSQL, ClamAV, Caddy opcional), papéis da BD com palavras-passe do ambiente, teste local repetível
  `scripts/ops/prod-smoke.sh`, guia em [../operacao/deploy.md](../operacao/deploy.md). Corrigido: os emails saíam sem
  remetente (`andaime.mail.from`).
- **Antivírus validado com o ClamAV real**: upload pela API com `andaime.antivirus.mode=clamd` → `scan_status = CLEAN`.

Verificação real:

```text
./mvnw verify → 111 testes, 0 falhas (com tudo integrado, incluindo o remetente dos emails)
npm run typecheck · npm run lint → sem erros · npm test → 36 testes
npm run e2e:saas → 26 passed (API com ClamAV real ligado)
```

### F8.1 — obras, ausências e EPI (2026-10-20)

Primeira fase das lacunas face à V3.1 (análise em `lacunas-v31.md`, não versionada):

- **Fim contratual** (V26): `sites.contract_end_date`, separado da previsão de fim (`end_date`). `SiteSchedule.delayWorkdays` (porta do protótipo) devolve o atraso em dias úteis na lista e na ficha. O frontend mostra o selo "Atrasada · N dias úteis" e o painel "Obras atrasadas" no início do gestor.
- **Licença** (V27): tipo de ausência `LEAVE`, com nota explicativa por tipo no formulário.
- **Artigos sem acentos** (V28): extensão `unaccent` e `app.fold_name` (IMMUTABLE) no índice único de `equipment_items`. O 409 `name-taken` traz `existingId`. Em "Fardamento e EPI", "Entregar artigo novo" cria ou reaproveita o artigo e abre logo a entrega.
- **Folha de entrega:**
  - `Holding.lastDeliveredOn`;
  - `GET /equipment/holdings/{employeeId}/sheet.xlsx` (POI, A4 vertical, no âmbito de `holdings`);
  - diálogo com pré-visualização e impressão A4 (`@page folha`).
- **Verificação:** `SiteScheduleTest` (4), `WorkforceSitesIntegrationTest` (5), `OperationsIntegrationTest` (3, alargado), `ModularityTest`, Vitest SaaS (7). `tsc` e `eslint` limpos.

### F8.2 — app do trabalhador: os meus dias (2026-10-20)

- **`GET /api/orgs/{orgId}/me/assignments?from&to`** (até 62 dias):
  - devolve as atribuições da própria pessoa com a obra (código, nome, morada, coordenadas, cor), o horário, a equipa, a viatura, o encarregado (da obra ou da equipa) e os colegas na mesma obra nesse dia;
  - o trabalhador continua sem acesso direto a obras e viaturas;
  - uma conta sem ficha de trabalhador recebe uma lista vazia.
- **Frontend:** painel "Os meus dias" na app do trabalhador, com hoje e os 13 dias seguintes, "Hoje" e "Amanhã" destacados e a morada a abrir no mapa. O ponto e "Esta semana" já existiam.
- **Verificação:** `PlanningIntegrationTest` com um teste novo (âmbito, colegas, período máximo); `tsc` e `eslint` limpos.

### Ainda não feito (decisões ou serviços externos)

- Deploy real: escolher e contratar fornecedores, DNS, segredos e TLS — passos em
  [../operacao/deploy.md](../operacao/deploy.md). Teste de intrusão externo.
- Decisão: dados de saúde (ausência por doença, ficha de aptidão médica) só para gestores?
- Tipos TypeScript gerados do OpenAPI; regeneração de códigos de recuperação 2FA; rotação da chave TOTP; bloqueio da API
  (e não só aviso) quando a empresa exige 2FA.
- Validação jurídica: rascunho técnico em [docs/juridico](../juridico/README.md) (registo de tratamentos, retenção,
  esboço de AIPD, regras por país) — não declara conformidade.

### Segurança automatizada (2026-10-20)

- OSV-Scanner sobre o SBOM das dependências Java na CI (falha com vulnerabilidades conhecidas); corrigidas as do Tomcat
  e do Jackson; Dependabot para Maven e Docker.
- OWASP ZAP (análise de API sem sessão): sem alertas altos/médios; alertas baixos corrigidos (cookie CSRF com SameSite,
  `Cross-Origin-Resource-Policy`, erros do servlet em JSON). Detalhe em [seguranca.md](seguranca.md).

## Comandos

```bash
# Infra (no WSL; projeto Compose "andaime" — não toca nos contentores de outros projetos)
wsl -d Ubuntu -- docker compose -f infra/compose.yaml up -d postgres mailpit objectstore
# API (perfil local, porta 8088): imagem Docker…
wsl -d Ubuntu -- docker compose -f infra/compose.yaml up -d --build backend
# …ou diretamente no WSL (arranque mais rápido durante o desenvolvimento)
wsl -d Ubuntu -- bash -lc "export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64; export PATH=$JAVA_HOME/bin:$PATH; cd /mnt/c/Users/Utilizador/IdeaProjects/Andaime/backend && ./mvnw spring-boot:run -Dspring-boot.run.profiles=local"
# Testes do backend (no WSL)
wsl -d Ubuntu -- bash -lc "export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64; export PATH=$JAVA_HOME/bin:$PATH; cd /mnt/c/Users/Utilizador/IdeaProjects/Andaime/backend && ./mvnw verify"
# Frontend real (Windows; /api é encaminhado para :8088)
npm run dev
# Protótipo antigo (só referência e testes dos módulos por migrar)
npm run dev:prototipo
# E2E de ponta a ponta (API com a semente de demonstração + Postgres + Mailpit + objectstore a correr)
npm run e2e:saas
# Backups e teste de restauro (no WSL)
scripts/ops/backup.sh backups/hoje && scripts/ops/restore-test.sh backups/hoje
# Empresa de demonstração no PostgreSQL local (idempotente; nunca em prod). Valores em infra/.env.example
wsl -d Ubuntu -- bash -lc "cd /mnt/c/Users/Utilizador/IdeaProjects/Andaime/backend && ./mvnw spring-boot:run -Dspring-boot.run.profiles=local -Dspring-boot.run.arguments='--andaime.seed.demo.enabled=true --andaime.seed.demo.owner-email=demo@andaime.test --andaime.seed.demo.owner-password=…'"
```

Emails de desenvolvimento: http://localhost:58035 (Mailpit). Primeiro Platform Admin: inserir o `user_id` em `platform_admins` com o papel `andaime_owner` (de propósito, não há endpoint para isso).
