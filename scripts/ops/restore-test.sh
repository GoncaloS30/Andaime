#!/usr/bin/env bash
# Teste de restauro: restaura um backup numa base de dados temporária e confirma que está completo e igual
# (migrações, contagens, RLS ativa, permissões do papel da aplicação). Apaga a base temporária no fim
# (KEEP=1 para a manter). Não toca na base de dados em uso.
#
#   scripts/ops/restore-test.sh backups/AAAAMMDD-HHMMSS
set -euo pipefail

DIR="${1:?indique o diretório do backup}"
PG="${ANDAIME_PG_CONTAINER:-andaime-postgres}"
TARGET="andaime_restore_$(date +%s)"

echo "→ Integridade dos ficheiros"
(cd "$DIR" && sha256sum --check --quiet MANIFEST.sha256)

echo "→ Restaurar em $TARGET"
docker exec "$PG" psql -U postgres -q -c "CREATE DATABASE $TARGET OWNER andaime_owner"
cleanup() {
  if [ "${KEEP:-0}" != "1" ]; then docker exec "$PG" psql -U postgres -q -c "DROP DATABASE IF EXISTS $TARGET" || true; fi
}
trap cleanup EXIT
docker exec -i "$PG" pg_restore -U postgres -d "$TARGET" --exit-on-error < "$DIR/andaime.dump"

echo "→ Comparar contagens"
docker exec "$PG" psql -U postgres -d "$TARGET" -At -c "
  SELECT 'flyway:' || count(*) FROM flyway_schema_history WHERE success
  UNION ALL SELECT 'organizations:' || count(*) FROM organizations
  UNION ALL SELECT 'employees:' || count(*) FROM employees
  UNION ALL SELECT 'assignments:' || count(*) FROM assignments
  UNION ALL SELECT 'time_entries:' || count(*) FROM time_entries
  UNION ALL SELECT 'documents:' || count(*) FROM documents
  UNION ALL SELECT 'audit_event:' || count(*) FROM audit_event" > /tmp/andaime-restore-counts.txt
diff -u "$DIR/counts.txt" /tmp/andaime-restore-counts.txt
cat /tmp/andaime-restore-counts.txt

echo "→ Segurança restaurada"
no_rls=$(docker exec "$PG" psql -U postgres -d "$TARGET" -At -c "
  SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN information_schema.columns col ON col.table_schema = n.nspname AND col.table_name = c.relname AND col.column_name = 'organization_id'
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'audit_event' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)")
test "$no_rls" = "0" || { echo "Tabelas com organization_id sem RLS forçada: $no_rls"; exit 1; }
docker exec "$PG" psql -U postgres -d "$TARGET" -At -c "SELECT has_table_privilege('andaime_app', 'public.time_entries', 'INSERT')" | grep -q t
echo "RLS e permissões: ok"

if [ -f "$DIR/objectstore.tar.gz" ]; then
  echo "→ Ficheiros: $(tar tzf "$DIR/objectstore.tar.gz" | grep -vc '/$') entradas legíveis"
fi
echo "Restauro verificado com sucesso."
