# Estado da migração para SaaS

> Documento vivo. Atualizado no fim de cada fase e sub-entrega. Serve também de briefing para continuar o trabalho noutra sessão/assistente.

Plano completo: secções "Arquitetura", "Modelo", "Endpoints" e "Sequência" em [arquitetura.md](arquitetura.md), [modelo-dados.md](modelo-dados.md), [api.md](api.md) e ADRs 0006–0011.

## Decisões fechadas

- Monorepo: frontend na raiz; `backend/` (Maven, Java 21, Spring Boot 4.1.1, Modulith 2.1.1, springdoc 3.1); `infra/` (Docker Compose).
- Docker só existe no WSL Ubuntu → build e testes do backend correm no WSL. O WSL tem JDK 25; compilamos com `--release 21` (o CI e a imagem Docker usam JDK 21).
- Autenticação por sessões Spring Security + Spring Session JDBC.
- Modo demo removido; módulos por migrar ficam em `/demo/*` com aviso até serem migrados.
- Portas: Postgres **55442**, API **8088**, Mailpit **51035** (SMTP) / **58035** (UI), MinIO **59010/59011** (F5). Nunca tocar nos contentores do projeto Mesa (8081, 55432, 51025, 58025) nem nos volumes `infra_*`.

## Fases

| Fase | Estado |
|---|---|
| F0 — Auditoria e arquitetura | ✅ ADRs 0006–0011 e `docs/backend/*` |
| F1 — Fundação SaaS | 🚧 em curso |
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

### F1 ainda pendente

- Serviços e endpoints de auth, `/api/me`, organizações, memberships, convites, auditoria e plataforma.
- Proteção contra brute force, ciclo de tokens por email, gestão/revogação de sessões, suite IDOR completa e testes HTTP/CSRF/429.
- Cliente HTTP/TanStack Query e ecrãs de autenticação/onboarding no frontend.
- Remoção do modo de apresentação e separação dos módulos ainda locais sob `/demo/*`.
- Playwright full-stack do fluxo de onboarding e convite.

## Comandos

```bash
# Infra (no WSL; nome de projeto "andaime")
wsl -d Ubuntu -- docker compose -f infra/compose.yaml --env-file infra/.env up -d
# Testes do backend (no WSL)
wsl -d Ubuntu -- bash -lc "export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64; export PATH=\$JAVA_HOME/bin:\$PATH; cd /mnt/c/Users/Utilizador/IdeaProjects/Andaime/backend && ./mvnw verify"
# Frontend (Windows)
npm run dev
```
