# ADR-0007: Multiempresa com organização no URL, isolamento na aplicação e RLS no PostgreSQL

**Estado:** Aceite · **Data:** 2026-10-18 · **Concretiza:** ADR-0004 ("RLS por empresa")

## Contexto
Cada empresa cliente tem os seus utilizadores, trabalhadores, obras, horas e documentos. Uma fuga entre empresas é o pior incidente possível para o produto. Um `tenantId` enviado pelo frontend não prova nada.

## Decisão
**Schema partilhado, coluna `organization_id` em todas as tabelas de tenant, com três barreiras:**

1. **Organização no URL e membership verificada em cada pedido.** Endpoints de tenant vivem em `/api/orgs/{orgId}/…`. O `TenantContextFilter` (depois do Spring Security) carrega a membership ativa do utilizador nessa org; se não existir responde **404** (não revela a existência da org). A "org ativa" guardada no utilizador é só preferência da UI — evita que um separador antigo escreva na empresa errada.
2. **Aplicação.** Repositórios e serviços filtram sempre pela org do contexto; autorização por papel (`@PreAuthorize` com hierarquia) e por âmbito (encarregado: equipas/obras que lidera; trabalhador: o próprio registo). Entidades referem outros agregados por UUID; **FKs compostas** `(organization_id, x_id) → x(organization_id, id)` impedem referências entre empresas na própria base de dados.
3. **PostgreSQL Row Level Security** (defesa em profundidade). Cada tabela de tenant tem `ENABLE` + `FORCE ROW LEVEL SECURITY` e a política `organization_id = app.current_org_id()` em `USING` e `WITH CHECK`.
   - O `TenantAwareJpaTransactionManager` executa, no início de **cada transação**, `set_config('app.org_id', ?, true)` e `set_config('app.user_id', ?, true)`. O terceiro argumento `true` torna o valor local à transação: no commit/rollback desaparece, por isso uma ligação devolvida ao pool Hikari nunca transporta a org de outro pedido.
   - Sem transação, não há org → as políticas devolvem 0 linhas (falha fechada). `open-in-view=false`.
   - `app.current_org_id()` usa `nullif(current_setting('app.org_id', true), '')::uuid` (depois de definido uma vez na sessão, o GUC vale `''` e não NULL).

**Papéis na base de dados** (criados pelo script de init, não pelo Flyway):

| Papel | Uso | RLS |
|---|---|---|
| `andaime_owner` | Dono do schema; executa Flyway | Ignora (dono) |
| `andaime_app` | Runtime da API, só DML, nunca dono de objetos | **Sujeito** |
| `andaime_platform` | Pool pequeno para operações de plataforma (listar/suspender orgs) | BYPASSRLS, permissões mínimas |

**Tabelas sem RLS** (acedidas só por chave): `users`, `platform_admins`, tabelas do Spring Session, tokens de autenticação, `login_throttle`, `event_publication`, `flyway_schema_history`. Pontos em que ainda não há org (aceitar convite por token, listar orgs ativas para jobs) usam funções `SECURITY DEFINER` com âmbito mínimo.

**Jobs:** percorrem `app.active_org_ids()` e abrem uma transação por organização com o contexto definido; `pg_try_advisory_lock` garante uma só instância a correr cada job.

**Platform Admin:** autoridade separada (não é membership). Para agir dentro de uma empresa precisa de um `support_access_grant` temporário com motivo; tudo fica auditado com `on_behalf`.

## Opções consideradas
| Opção | Prós | Contras |
|---|---|---|
| **Schema partilhado + RLS (escolhida)** | Uma migração para todos, pooling simples, barreira na BD | Disciplina no contexto de transação |
| Schema por empresa | Isolamento forte | Migrações N vezes, pool por schema, relatórios de plataforma difíceis |
| Base de dados por empresa | Isolamento máximo | Custo e operação desproporcionados para PMEs |
| Só filtro na aplicação | Simples | Um `WHERE` esquecido = fuga |

## Consequências
- Testes obrigatórios: suite IDOR que enumera todas as rotas `{orgId}`/`{id}` (uma rota nova não classificada parte o build); testes RLS em JDBC como `andaime_app`; teste de lint ao schema (RLS ativa e política em todas as tabelas com `organization_id`, nenhuma tabela pertence a `andaime_app`).
- Risco: código assíncrono sem contexto devolve vazio. Eventos de domínio transportam `orgId` e os listeners repõem o contexto.
