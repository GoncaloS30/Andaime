# ADR-0005: Fluxo de trabalho no Git e integração contínua

**Estado:** Aceite
**Data:** 2026-10-18

## Contexto

O projeto passa de uma pasta local para um repositório GitHub privado (`GoncaloS30/Andaime`), preparado para trabalhar como uma equipa de produto:

- várias pessoas a mexer em módulos que partilham a mesma store;
- um `main` sempre demonstrável;
- verificação automática em cada alteração.

## Decisão

- **Trunk-based development:**
  - ramos curtos (`feat/`, `fix/`, `perf/`, `docs/`, `chore/`) a partir de `main`;
  - pull request obrigatório;
  - merge só por **squash**, com histórico linear;
  - o ramo é apagado depois do merge.
- **CI no GitHub Actions** (`.github/workflows/ci.yml`), com 4 jobs que têm de estar verdes antes do merge:
  1. tipos, lint e testes unitários;
  2. build de produção;
  3. E2E e acessibilidade com Playwright no Microsoft Edge;
  4. `npm audit`.
- **Conventional Commits** em português e **SemVer**, com o registo de alterações no `CHANGELOG.md`.
- **Dependabot** para npm (semanal, agrupado) e para as GitHub Actions (mensal).
- **CODEOWNERS** para pedir revisão nas áreas sensíveis (`src/domain`, `src/store`, `.github`, ADRs).
- **Licença proprietária** e repositório privado.

## Alternativas consideradas

| Opção | Porque não |
|---|---|
| GitFlow (`develop` + `release/*`) | Demasiado cerimonial para uma equipa pequena e um produto sem versões instaladas em clientes |
| Merge commits | Histórico ruidoso; o squash dá um commit por PR, com título em Conventional Commits |
| E2E só em Chromium na CI | Os testes e o relatório de revisão foram feitos em Edge; manter o mesmo motor evita diferenças entre local e CI |

## Consequências

- Uma alteração só chega ao `main` com a CI verde. Os E2E demoram vários minutos, por isso `concurrency` cancela as execuções antigas do mesmo PR.
- Os testes E2E fixam o relógio (quinta-feira, 15/10/2026) para não dependerem do dia em que correm.
- **Limitação do plano gratuito:** num repositório privado, as regras de proteção de ramos só são aplicadas com GitHub Pro ou Team. Até lá, as regras ficam configuradas como convenção (este ADR e o `CONTRIBUTING.md`), e a CI continua a correr em cada PR.
