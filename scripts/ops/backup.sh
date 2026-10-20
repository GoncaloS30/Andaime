#!/usr/bin/env bash
# Backup do Andaime: base de dados PostgreSQL (formato custom, comprimido) + ficheiros do armazenamento S3 local,
# com manifesto (SHA-256) e contagens de controlo usadas pelo teste de restauro.
#
#   scripts/ops/backup.sh [diretório]          (por omissão: backups/AAAAMMDD-HHMMSS)
#   ANDAIME_DB=andaime ANDAIME_PG_CONTAINER=andaime-postgres ANDAIME_OBJECTSTORE_VOLUME=andaime_andaime-objectstore-data
#
# Corre onde o Docker está (no Windows: dentro do WSL). Em produção, usar também arquivo contínuo de WAL
# (ver docs/operacao/backups.md) e o versionamento/replicação do fornecedor de S3.
set -euo pipefail

DB="${ANDAIME_DB:-andaime}"
PG="${ANDAIME_PG_CONTAINER:-andaime-postgres}"
VOLUME="${ANDAIME_OBJECTSTORE_VOLUME:-andaime_andaime-objectstore-data}"
DIR="${1:-backups/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$DIR"

echo "→ Base de dados $DB"
docker exec "$PG" pg_dump -U postgres -d "$DB" --format=custom --compress=6 > "$DIR/andaime.dump"
docker exec "$PG" pg_dumpall -U postgres --roles-only --no-role-passwords > "$DIR/roles.sql"

echo "→ Contagens de controlo"
docker exec "$PG" psql -U postgres -d "$DB" -At -c "
  SELECT 'flyway:' || count(*) FROM flyway_schema_history WHERE success
  UNION ALL SELECT 'organizations:' || count(*) FROM organizations
  UNION ALL SELECT 'employees:' || count(*) FROM employees
  UNION ALL SELECT 'assignments:' || count(*) FROM assignments
  UNION ALL SELECT 'time_entries:' || count(*) FROM time_entries
  UNION ALL SELECT 'documents:' || count(*) FROM documents
  UNION ALL SELECT 'audit_event:' || count(*) FROM audit_event" > "$DIR/counts.txt"

if docker volume inspect "$VOLUME" > /dev/null 2>&1; then
  echo "→ Armazenamento de ficheiros ($VOLUME)"
  docker run --rm -v "$VOLUME":/data:ro -v "$(cd "$DIR" && pwd)":/backup alpine:3 tar czf /backup/objectstore.tar.gz -C /data .
else
  echo "→ Sem volume de armazenamento $VOLUME (ignorado)"
fi

(cd "$DIR" && sha256sum ./* > MANIFEST.sha256)
echo "Backup em $DIR"
cat "$DIR/counts.txt"
