# ADR-0006: Backend Spring Boot como monólito modular

**Estado:** Aceite · **Data:** 2026-10-18 · **Substitui parcialmente:** ADR-0002 (store local como fonte única)

## Contexto
O Andaime deixa de ser um protótipo e passa a SaaS multiempresa. Toda a lógica de negócio está hoje no browser (`src/domain`, `src/store`) e os dados vivem em `localStorage`. Precisamos de uma fonte de verdade persistente, partilhada entre utilizadores e segura, sem complexidade operacional desnecessária para uma equipa pequena.

## Decisão
- **Java 21 + Spring Boot 4.1** (Spring Framework 7, Security 7, Hibernate 7), **PostgreSQL 18**, **Flyway**, **Spring Modulith 2.1**, springdoc-openapi 3, Testcontainers 2. A linha 3.5 saiu do suporte OSS em 2026; 4.1.x é a versão GA atual.
- **Um único deployable** (`backend/`, Maven) organizado em módulos de domínio: `identity`, `organization`, `platform`, `policy`, `audit`, `workforce`, `sites`, `fleet`, `planning`, `timekeeping`, `absences`, `documents`, `equipment`, `notifications`, `reporting` e `shared`.
- Cada módulo é um pacote `pt.andaime.<módulo>` com `api` (controllers + DTOs), `application` (serviços/casos de uso), `domain` (entidades e regras), `infrastructure` (repositórios, integrações). Outros módulos só usam o que o pacote raiz expõe (fachadas, eventos). `ApplicationModules.verify()` corre nos testes.
- Controllers finos; **DTOs em records**, nunca entidades JPA; regras no domínio e nos serviços; `open-in-view=false`.
- Erros em **RFC 9457 ProblemDetail** com `code` estável.
- Eventos entre módulos via Spring Modulith com **registo de publicação JDBC (outbox transacional)**.
- Monorepo: o frontend continua na raiz; `backend/` e `infra/` ao lado. O contrato OpenAPI é gerado pelo backend e os tipos TypeScript são gerados a partir dele.
- Backend autoritativo: `src/domain` (TS) é portado para Java módulo a módulo; no cliente fica só apresentação e formatação.

## Opções consideradas
| Opção | Prós | Contras |
|---|---|---|
| **Monólito modular (escolhida)** | Uma transação para operações cruzadas (transferir trabalhador, copiar semana), deploy simples, limites verificados | Escala vertical primeiro |
| Microserviços | Escala independente | Transações distribuídas, observabilidade, custo — sem necessidade demonstrada |
| Next.js full-stack | Uma linguagem | Requisito explícito de Java/Spring; ecossistema empresarial (JPA, Security) mais maduro |

## Consequências
- Mais fácil: transações ACID entre módulos, testes de integração reais, uma pipeline.
- Mais difícil: a UI deixa de ter ações síncronas; mutações passam a ser assíncronas (TanStack Query).
- Revisitar: extrair `reporting` ou exportações assíncronas para um worker se a carga o justificar.
