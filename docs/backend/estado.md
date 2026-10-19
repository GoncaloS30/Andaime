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
| F2 — Trabalhadores, obras, equipas | ⏳ |
| F3 — Planeamento e viaturas | ⏳ |
| F4 — Horas e aprovações | ⏳ |
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
```

Emails de desenvolvimento: http://localhost:58035 (Mailpit). Primeiro Platform Admin: inserir o `user_id` em `platform_admins` com o papel `andaime_owner` (de propósito, não há endpoint para isso).
