# Backups e restauro

## O que se guarda

| Dados | Como | Onde |
|---|---|---|
| PostgreSQL (todas as empresas, sessões, auditoria) | `pg_dump` diário em formato custom + arquivo contínuo de WAL | Armazenamento externo, cifrado, noutra região/fornecedor |
| Papéis da base de dados (sem palavras-passe) | `pg_dumpall --roles-only --no-role-passwords` | Junto com o dump |
| Ficheiros dos documentos | Versionamento + replicação do S3 do fornecedor (produção); `tar` do volume (desenvolvimento) | Outro bucket/região |

Objetivos propostos (a confirmar com os clientes): **RPO ≤ 15 min** (WAL), **RTO ≤ 4 h**. Retenção: diários 35 dias,
mensais 12 meses (a validar juridicamente com a retenção de dados laborais).

## Scripts

```bash
# Backup (no WSL/servidor com Docker): dump, papéis, ficheiros, contagens de controlo e manifesto SHA-256
ANDAIME_DB=andaime scripts/ops/backup.sh backups/2026-10-20
# Teste de restauro: restaura numa base temporária e compara contagens, migrações, RLS e permissões
scripts/ops/restore-test.sh backups/2026-10-20
```

Execução real em 2026-10-20 (base de desenvolvimento com a empresa de demonstração):

```text
flyway:19  organizations:11  employees:53  assignments:364  time_entries:204  documents:1  audit_event:510
→ Integridade dos ficheiros (SHA-256) ok
→ Restaurar em andaime_restore_… → contagens iguais
→ RLS forçada em todas as tabelas com organization_id; permissões do papel da aplicação ok
→ Ficheiros: 103 entradas legíveis
Restauro verificado com sucesso.
```

## Arquivo contínuo de WAL (produção)

Em PostgreSQL gerido, ativar o *point-in-time recovery* do fornecedor. Em PostgreSQL próprio, usar pgBackRest ou
WAL-G (open source), por exemplo:

```ini
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'pgbackrest --stanza=andaime archive-push %p'
archive_timeout = 300
```

## Ensaio de restauro (mensal)

1. Restaurar o backup mais recente numa máquina isolada (`restore-test.sh`).
2. Arrancar a API contra a base restaurada com o perfil `prod` e credenciais de teste.
3. Confirmar: entrar, abrir planeamento e horas de uma empresa, descarregar um documento.
4. Registar a duração (para o RTO) e apagar o ambiente.
