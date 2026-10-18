# Como contribuir

Guia de trabalho da equipa do Andaime. Curto de propósito: o que não estiver aqui, segue o que já existe no código.

## Ambiente

- Node 24 (ver `.nvmrc`) e npm.
- Microsoft Edge instalado (os testes E2E correm no canal `msedge`).

```bash
npm ci
npm run dev
```

## Fluxo de trabalho

Trabalhamos em **trunk-based development**: o ramo `main` está sempre pronto a demonstrar.

1. Cada trabalho começa numa issue (erro ou funcionalidade) e num ramo curto a partir de `main`:

   | Prefixo | Uso | Exemplo |
   |---|---|---|
   | `feat/` | Funcionalidade | `feat/diario-de-obra` |
   | `fix/` | Correção | `fix/overflow-viatura` |
   | `perf/` | Desempenho | `perf/lcp-capas` |
   | `docs/` | Documentação | `docs/adr-0005` |
   | `chore/` | Configuração e dependências | `chore/ci-cache` |

2. Abra um **pull request** cedo (pode ser rascunho). O modelo de PR tem a lista de verificação.
3. O `main` está protegido. Para fazer merge, a CI tem de estar verde (tipos, lint, testes unitários, build, E2E e auditoria) e as conversas resolvidas.
4. O merge faz-se sempre por **squash**. O título do PR passa a ser a mensagem do commit no `main`.

## Mensagens de commit

Usamos [Conventional Commits](https://www.conventionalcommits.org/pt-br/), com a descrição em português:

```
feat(planeamento): alterar período arrastando a pega do bloco
fix(fotos): retratos com a cabeça cortada no recorte quadrado
perf: capas com tamanho intermédio para telemóvel
```

Tipos: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`, `ci`. O âmbito é o módulo (`planeamento`, `obras`, `horas`, `fotos`…).

## Qualidade

- **Regras de negócio e store:** teste primeiro (TDD), em `src/domain` e `src/store`.
- **Cada fluxo novo:** teste de store e teste E2E.
- **Interface:**
  - sem overflow a 360 px;
  - teclado e foco visível;
  - axe sem violações sérias;
  - textos em pt-PT conforme `docs/copy.md`.
- **Decisões de arquitetura:** um ADR em `docs/adr/`.
- **Dados:** nunca dados pessoais reais, nem credenciais (ver `SECURITY.md`).

## Versões

Seguimos [SemVer](https://semver.org/lang/pt-BR/) e [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/):

- cada PR acrescenta uma linha à secção "Por publicar" do `CHANGELOG.md`;
- uma versão é uma tag `vX.Y.Z` no `main` com uma release no GitHub.
