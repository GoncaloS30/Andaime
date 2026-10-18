# ADR-0008: Autenticação com sessões Spring Security guardadas em PostgreSQL

**Estado:** Aceite · **Data:** 2026-10-18

## Contexto
Precisamos de autenticação real, revogável e segura para gestores, encarregados e trabalhadores (estes muitas vezes no telemóvel). A SPA e a API são servidas na **mesma origem** (proxy do Vite em desenvolvimento, reverse proxy em produção).

## Decisão
- **Credenciais próprias** (email + password), hash **Argon2id** via `DelegatingPasswordEncoder` (permite migrar algoritmo).
- **Sessão no servidor** com **Spring Session JDBC** (tabelas no PostgreSQL) → funciona com várias instâncias e permite listar/revogar sessões.
- Cookie `ANDAIME_SESSION`: `HttpOnly`, `Secure` (exceto perfil local), `SameSite=Lax`, `Path=/`. Inatividade 8 h; duração máxima 7 dias.
- **CSRF** ativo (`csrf.spa()`): cookie `XSRF-TOKEN` legível pelo JS e cabeçalho `X-XSRF-TOKEN` em mutações.
- Fixação de sessão: novo id no login. Repor password e "terminar todas as sessões" invalidam as sessões do utilizador (`FindByIndexNameSessionRepository`).
- **Força bruta:** limite por IP nos endpoints `/api/auth/**` (Bucket4j em memória por instância; Redis/Postgres se houver várias instâncias) + `login_throttle` por email com bloqueio exponencial; respostas neutras ("credenciais inválidas").
- Verificação de email e recuperação de password por **token aleatório de 256 bits**, guardado só como hash SHA-256, de uso único e com validade (24 h / 30 min). Em desenvolvimento os emails vão para o Mailpit.
- **Nunca** tokens em `localStorage`. O frontend só sabe "estou autenticado" via `GET /api/me`.
- Eventos de autenticação (login, falha, logout, reposição) vão para `audit_event`.
- **Sem CORS**: mesma origem em todos os ambientes.

## Opções consideradas
| Opção | Prós | Contras |
|---|---|---|
| **Sessões Spring (escolhida)** | Sem custos, revogação imediata, nenhum segredo no browser, tecnologia consolidada | Gerimos passwords (mitigado com Argon2id, throttling, reposição) |
| Keycloak self-hosted | MFA/SSO prontos | Mais um serviço para operar e atualizar |
| OIDC gerido (Auth0, Entra) | Menos operação | Pago, dependência de fornecedor |
| JWT no browser | Stateless | Revogação difícil; tokens expostos a XSS |

## Consequências
- Evolução prevista: MFA (TOTP/WebAuthn) para OWNER/ADMIN e login social/SSO via `spring-security-oauth2-client` sem mudar o modelo de sessão.
- Testes: CSRF obrigatório, 401 em sessão expirada, revogação, bloqueio por tentativas, 429.
