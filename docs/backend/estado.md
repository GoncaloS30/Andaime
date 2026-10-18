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

## Comandos

```bash
# Infra (no WSL; nome de projeto "andaime")
wsl -d Ubuntu -- docker compose -f infra/compose.yaml --env-file infra/.env up -d
# Testes do backend (no WSL)
wsl -d Ubuntu -- bash -lc "cd /mnt/c/Users/Utilizador/IdeaProjects/Andaime/backend && ./mvnw verify"
# Frontend (Windows)
npm run dev
```
