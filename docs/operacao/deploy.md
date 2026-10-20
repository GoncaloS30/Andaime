# Deploy, migrações e rollback

## Variáveis de ambiente (produção, perfil `prod`)

| Variável | Obrigatória | Notas |
|---|---|---|
| `SPRING_PROFILES_ACTIVE=prod` | sim | Cookies `Secure`, Swagger desligado, `flyway clean` desligado |
| `ANDAIME_DATABASE_URL` | sim | `jdbc:postgresql://…/andaime` |
| `ANDAIME_DATABASE_USER` / `_PASSWORD` | sim | Papel `andaime_app` (só DML, sem BYPASSRLS) |
| `ANDAIME_DATABASE_OWNER` / `_OWNER_PASSWORD` | sim | Papel `andaime_owner`, só para as migrações Flyway |
| `andaime.platform-datasource.*` | sim | Papel `andaime_platform` (BYPASSRLS, só leitura/estado de organizações) |
| `ANDAIME_STORAGE_ENDPOINT` / `_REGION` / `_BUCKET` | sim | S3 privado |
| `ANDAIME_STORAGE_ACCESS_KEY` / `_SECRET_KEY` | sim | Sem valor por omissão em `prod` |
| `ANDAIME_MAIL_HOST` / `_PORT` | sim | SMTP transacional |
| `ANDAIME_MANAGEMENT_PORT` | não (8098) | Métricas internas |

Os segredos vêm do gestor de segredos da plataforma; nunca do repositório. Os papéis da base de dados são criados por
`infra/postgres/init/00-roles.sql` (adaptar as palavras-passe).

## Checklist antes do deploy

- [ ] CI verde no `main`: qualidade, build, backend (Testcontainers), E2E do protótipo e E2E full-stack (inclui acessibilidade).
- [ ] Notas da versão revistas (`CHANGELOG.md`); migrações novas identificadas e revistas (só *expand*, ver abaixo).
- [ ] Backup recente verificado (`scripts/ops/restore-test.sh` < 24 h) e WAL a arquivar.
- [ ] Imagem construída a partir da tag do `main`, com o mesmo `andaime-api-*.jar` testado.
- [ ] Janela combinada se houver migração longa (índices grandes: `CREATE INDEX CONCURRENTLY` numa migração própria).

## Durante

1. Aplicar a imagem nova numa instância (as migrações Flyway correm no arranque, como `andaime_owner`).
2. Verificar `GET /actuator/health/readiness` = `UP` e os logs (sem `ERROR` no arranque).
3. Teste de fumo: entrar com uma conta de teste, abrir o planeamento e as horas de uma empresa de teste.
4. Rodar as restantes instâncias.

## Depois

- [ ] Taxa de erros 5xx e latência p95 do `/api` normais durante 30 min (Prometheus).
- [ ] Sem picos de `401/403/404` inesperados (indicador de regressão de permissões).
- [ ] Registar a versão e a hora no registo de alterações operacionais.

## Migrações: *expand/contract*

A versão anterior da API tem de funcionar com o esquema novo (para permitir rollback rápido da aplicação):

1. **Expand** (versão N): só acrescentar — tabelas, colunas *nullable* ou com valor por omissão, índices, funções.
   Nunca renomear nem apagar colunas usadas pela versão N−1.
2. Código da versão N escreve no formato novo e lê ambos.
3. **Contract** (versão N+1 ou posterior, depois de N estar estável): remover o que já não é usado.

Numeração: as migrações são sequenciais (`V18_2`, `V19`, …). Em trabalho paralelo, reservar números antes de começar.

## Rollback

- **Aplicação:** voltar à imagem anterior (compatível com o esquema, por causa do *expand/contract*). Não é preciso tocar na base de dados.
- **Migração com problema:** não editar migrações já aplicadas. Corrigir com uma migração nova (*roll forward*).
- **Dados corrompidos:** restauro *point-in-time* a partir do backup base + WAL para uma base nova, validação com
  `restore-test.sh`, e troca da ligação (ver [backups.md](backups.md)). Avisar os clientes afetados.
