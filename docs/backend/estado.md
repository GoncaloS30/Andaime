# Estado da migração para SaaS

> Documento vivo. Atualizado no fim de cada fase e sub-entrega. Serve também de briefing para continuar o trabalho noutra sessão/assistente.

Plano completo: secções "Arquitetura", "Modelo", "Endpoints" e "Sequência" em [arquitetura.md](arquitetura.md), [modelo-dados.md](modelo-dados.md), [api.md](api.md) e ADRs 0006–0011.

## Decisões fechadas

- Monorepo: frontend na raiz; `backend/` (Maven, Java 21, Spring Boot 4.1.1, Modulith 2.1.1, springdoc 3.1); `infra/` (Docker Compose).
- Docker só existe no WSL Ubuntu → build e testes do backend correm no WSL com JDK 21 (o CI e a imagem Docker usam a mesma versão).
- Autenticação por sessões Spring Security + Spring Session JDBC.
- Modo demo removido da aplicação; o protótipo antigo só existe nos builds `e2e`/`prototipo` (testes), nunca em produção, e é apagado módulo a módulo.
- Portas: Postgres **55442**, API **8088**, Mailpit **51035** (SMTP) / **58035** (UI), MinIO **59010/59011** (F5). Nunca tocar nos contentores do projeto Mesa (8081, 55432, 51025, 58025) nem nos volumes `infra_*`.

## Fases

| Fase | Estado |
|---|---|
| F0 — Auditoria e arquitetura | ✅ ADRs 0006–0011 e `docs/backend/*` |
| F1 — Fundação SaaS | ✅ concluída em 2026-10-19 |
| F2 — Trabalhadores, obras, equipas | ✅ concluída em 2026-10-19 |
| F3 — Planeamento e viaturas | ✅ concluída em 2026-10-19 |
| F4 — Horas e aprovações | ✅ concluída em 2026-10-19 |
| F5 — Documentos, ausências, equipamentos, notificações | ⏳ |
| F6 — Mapas e relatórios | ⏳ |
| F7 — Hardening | ⏳ |

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

## Comandos

```bash
# Infra (no WSL; projeto Compose "andaime" — não toca nos contentores de outros projetos)
wsl -d Ubuntu -- docker compose -f infra/compose.yaml up -d postgres mailpit
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
# E2E de ponta a ponta (API + Postgres + Mailpit a correr)
npm run e2e:saas
# Empresa de demonstração no PostgreSQL local (idempotente; nunca em prod). Valores em infra/.env.example
wsl -d Ubuntu -- bash -lc "cd /mnt/c/Users/Utilizador/IdeaProjects/Andaime/backend && ./mvnw spring-boot:run -Dspring-boot.run.profiles=local -Dspring-boot.run.arguments='--andaime.seed.demo.enabled=true --andaime.seed.demo.owner-email=demo@andaime.test --andaime.seed.demo.owner-password=…'"
```

Emails de desenvolvimento: http://localhost:58035 (Mailpit). Primeiro Platform Admin: inserir o `user_id` em `platform_admins` com o papel `andaime_owner` (de propósito, não há endpoint para isso).
