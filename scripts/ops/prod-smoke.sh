#!/usr/bin/env bash
# Ensaio local da stack de produção (infra/compose.prod.yaml + infra/compose.prod-smoke.yaml): constrói as imagens,
# arranca tudo com segredos descartáveis, verifica o proxy, os cabeçalhos, a API, o email, o S3, o ClamAV e o SSE
# pelo nginx, e no fim apaga TUDO o que criou (contentores, volumes, rede) — só do projeto indicado.
#
#   scripts/ops/prod-smoke.sh                   (porta 18480; KEEP=1 para deixar a stack a correr)
#   ANDAIME_SMOKE_PORT=18480 ANDAIME_SMOKE_PROJECT=andaime-prodtest scripts/ops/prod-smoke.sh
#
# Precisa de docker (com compose), curl, python3 e openssl. No Windows: correr dentro do WSL.
set -euo pipefail

cd "$(dirname "$0")/../.."
PROJECT="${ANDAIME_SMOKE_PROJECT:-andaime-prodtest}"
PORT="${ANDAIME_SMOKE_PORT:-18480}"
MAILPIT_PORT="${ANDAIME_SMOKE_MAILPIT_PORT:-18425}"
ENV_FILE="$(mktemp /tmp/andaime-prodtest.XXXXXX.env)"
WORK="$(mktemp -d /tmp/andaime-prodtest.XXXXXX)"
BASE="http://localhost:$PORT"
PUBLIC_URL="https://andaime.exemplo.test"
MAIL_FROM="Andaime <nao-responder@andaime.exemplo.test>"
COMPOSE=(docker compose -f infra/compose.prod.yaml -f infra/compose.prod-smoke.yaml --env-file "$ENV_FILE" -p "$PROJECT")
FAILURES=0

for port in "$PORT" "$MAILPIT_PORT"; do
  if ss -ltn | awk '{print $4}' | grep -Eq "[:.]$port\$"; then
    echo "A porta $port já está em uso; escolha outra (ANDAIME_SMOKE_PORT / ANDAIME_SMOKE_MAILPIT_PORT)." >&2
    exit 2
  fi
done

cleanup() {
  if [ "${KEEP:-0}" = "1" ]; then
    echo "KEEP=1: stack $PROJECT a correr em $BASE (env: $ENV_FILE). Apagar: ${COMPOSE[*]} down -v"
  else
    echo "→ A apagar a stack $PROJECT (contentores, volumes, rede)"
    "${COMPOSE[@]}" down -v --remove-orphans > /dev/null 2>&1 || true
    rm -f "$ENV_FILE"
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

secret() { openssl rand -hex 24; }
cat > "$ENV_FILE" <<EOF
ANDAIME_VERSION=${ANDAIME_VERSION:-prodtest}
ANDAIME_PUBLIC_URL=$PUBLIC_URL
ANDAIME_HTTP_BIND=127.0.0.1
ANDAIME_HTTP_PORT=$PORT
ANDAIME_SMOKE_MAILPIT_PORT=$MAILPIT_PORT
POSTGRES_PASSWORD=$(secret)
ANDAIME_DATABASE_OWNER_PASSWORD=$(secret)
ANDAIME_DATABASE_PASSWORD=$(secret)
ANDAIME_PLATFORM_DATABASE_PASSWORD=$(secret)
ANDAIME_MAIL_HOST=mailpit
ANDAIME_MAIL_PORT=1025
ANDAIME_MAIL_USERNAME=ensaio
ANDAIME_MAIL_PASSWORD=$(secret)
ANDAIME_MAIL_FROM=$MAIL_FROM
ANDAIME_MAIL_STARTTLS=false
ANDAIME_STORAGE_ENDPOINT=http://objectstore:8333
ANDAIME_STORAGE_REGION=eu-west-1
ANDAIME_STORAGE_BUCKET=andaime-prodtest
ANDAIME_STORAGE_ACCESS_KEY=andaime-local
ANDAIME_STORAGE_SECRET_KEY=andaime-local-secret
ANDAIME_TOTP_KEY=$(openssl rand -base64 32)
EOF

pass() { echo "  ok    $1"; }
fail() { echo "  FALHA $1" >&2; FAILURES=$((FAILURES + 1)); }
expect() { # descrição, valor obtido, padrão (regex) esperado
  if printf '%s' "$2" | grep -Eq -- "$3"; then pass "$1"; else fail "$1 (obtido: $(printf '%s' "$2" | head -c 300))"; fi
}
header() { grep -i "^$2:" "$1" | head -1 | tr -d '\r'; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
# Pedidos como se viessem do balanceador com TLS (o nginx passa X-Forwarded-Proto ao backend).
req() { curl -sS -H 'X-Forwarded-Proto: https' -b "$WORK/jar" -c "$WORK/jar" "$@"; }
xsrf() { awk '$6 == "XSRF-TOKEN" {print $7}' "$WORK/jar" | tail -1; }

echo "→ Validar o compose"
"${COMPOSE[@]}" config -q && pass "docker compose config"

echo "→ Arrancar $PROJECT na porta $PORT (o ClamAV pode demorar alguns minutos a carregar as assinaturas)"
"${COMPOSE[@]}" up -d --build --wait --wait-timeout "${ANDAIME_SMOKE_TIMEOUT:-900}"
"${COMPOSE[@]}" ps --format 'table {{.Service}}\t{{.Status}}'

echo "→ SPA e cabeçalhos"
curl -sS -D "$WORK/h" -o "$WORK/index.html" -H 'X-Forwarded-Proto: https' "$BASE/" -w '%{http_code}' > "$WORK/code"
expect "GET / → 200" "$(cat "$WORK/code")" '^200$'
expect "GET / devolve o index.html" "$(cat "$WORK/index.html")" '<div id="root">'
expect "Content-Security-Policy" "$(header "$WORK/h" content-security-policy)" "frame-ancestors 'none'"
expect "X-Content-Type-Options" "$(header "$WORK/h" x-content-type-options)" 'nosniff'
expect "Referrer-Policy" "$(header "$WORK/h" referrer-policy)" 'strict-origin-when-cross-origin'
expect "Permissions-Policy" "$(header "$WORK/h" permissions-policy)" 'camera=\(\)'
expect "HSTS atrás de TLS" "$(header "$WORK/h" strict-transport-security)" 'max-age=31536000'
expect "index.html sem cache" "$(header "$WORK/h" cache-control)" 'no-cache'
expect "sem versão do nginx" "$(header "$WORK/h" server)" '^[Ss]erver: nginx$'
curl -sS -D "$WORK/h2" -o /dev/null "$BASE/"
if [ -z "$(header "$WORK/h2" strict-transport-security)" ]; then pass "sem HSTS em HTTP simples"; else fail "HSTS enviado em HTTP simples"; fi

code=$(curl -sS -o "$WORK/deep.html" -w '%{http_code}' "$BASE/planeamento")
expect "GET /planeamento (deep link) → 200" "$code" '^200$'
expect "deep link devolve o index.html" "$(cat "$WORK/deep.html")" '<div id="root">'

asset=$(grep -Eo '/assets/[^"]+\.js' "$WORK/index.html" | head -1)
curl -sS -D "$WORK/ha" -o /dev/null -H 'Accept-Encoding: gzip' "$BASE$asset"
expect "asset com hash → imutável" "$(header "$WORK/ha" cache-control)" 'max-age=31536000, immutable'
expect "asset comprimido (gzip)" "$(header "$WORK/ha" content-encoding)" 'gzip'
expect "asset inexistente → 404" "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/assets/nao-existe.js")" '^404$'

echo "→ Actuator fora do proxy"
expect "/actuator/prometheus → 404" "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/actuator/prometheus")" '^404$'
expect "/actuator/health → 404" "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/actuator/health")" '^404$'
expect "/api/../actuator/prometheus → 404" "$(curl -sS --path-as-is -o /dev/null -w '%{http_code}' "$BASE/api/../actuator/prometheus")" '^404$'
metrics=$("${COMPOSE[@]}" exec -T backend curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8098/actuator/prometheus)
expect "Prometheus na porta de gestão interna (8098, rede interna)" "$metrics" '^200$'
public=$("${COMPOSE[@]}" exec -T backend curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/actuator/prometheus)
expect "Prometheus recusado na porta pública do backend" "$public" '^(401|403|404)$'

echo "→ API pelo nginx"
code=$(req -D "$WORK/hc" -o "$WORK/csrf.json" -w '%{http_code}' "$BASE/api/auth/csrf")
expect "GET /api/auth/csrf → 200" "$code" '^200$'
expect "csrf em JSON" "$(header "$WORK/hc" content-type)" 'application/json'
expect "cookie XSRF-TOKEN" "$(grep -i '^set-cookie: XSRF-TOKEN' "$WORK/hc" | tr -d '\r')" 'XSRF-TOKEN=.+Secure'

EMAIL="dono-$(openssl rand -hex 4)@andaime.exemplo.test"
PASSWORD="Ensaio-$(openssl rand -hex 8)"
code=$(req -o /dev/null -w '%{http_code}' -H "X-XSRF-TOKEN: $(xsrf)" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"Ensaio Produção\"}" "$BASE/api/auth/signup")
expect "registo → 202" "$code" '^202$'

echo "→ Email (SMTP autenticado)"
message=""
for _ in $(seq 1 30); do
  message=$(curl -sS "http://127.0.0.1:$MAILPIT_PORT/api/v1/search?query=to:$EMAIL" | json "d['messages'][0]['ID'] if d['messages'] else ''")
  [ -n "$message" ] && break
  sleep 1
done
curl -sS "http://127.0.0.1:$MAILPIT_PORT/api/v1/message/$message" > "$WORK/mail.json"
expect "cabeçalho From = ANDAIME_MAIL_FROM" "$(json "d['From']['Name'] + ' <' + d['From']['Address'] + '>'" < "$WORK/mail.json")" '^Andaime <nao-responder@andaime\.exemplo\.test>$'
link=$(json "d['Text']" < "$WORK/mail.json" | grep -Eo 'https?://[^ ]+verificar-email\?token=[A-Za-z0-9_-]+' | head -1)
expect "link com ANDAIME_PUBLIC_URL" "$link" "^$PUBLIC_URL/verificar-email\\?token="
token="${link##*token=}"
code=$(req -o /dev/null -w '%{http_code}' -H "X-XSRF-TOKEN: $(xsrf)" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$token\"}" "$BASE/api/auth/verify-email")
expect "verificar email → 204" "$code" '^204$'

code=$(req -D "$WORK/hl" -o /dev/null -w '%{http_code}' -H "X-XSRF-TOKEN: $(xsrf)" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" "$BASE/api/auth/login")
expect "login → 200" "$code" '^200$'
expect "cookie de sessão Secure/HttpOnly" "$(grep -i '^set-cookie: ANDAIME_SESSION' "$WORK/hl" | tr -d '\r')" 'Secure; HttpOnly; SameSite=Lax'
req -o /dev/null "$BASE/api/auth/csrf"

echo "→ Administrador da plataforma (papel andaime_platform)"
"${COMPOSE[@]}" exec -T postgres psql -U postgres -d andaime -v ON_ERROR_STOP=1 -q \
  -c "INSERT INTO platform_admins (user_id) SELECT id FROM users WHERE email = '$EMAIL'"
expect "GET /api/platform/orgs → 200" "$(req -o /dev/null -w '%{http_code}' "$BASE/api/platform/orgs")" '^200$'

echo "→ Empresa, SSE, S3 e ClamAV"
org=$(req -H "X-XSRF-TOKEN: $(xsrf)" -H 'Content-Type: application/json' \
  -d '{"name":"Ensaio Produção, Lda.","country":"PT"}' "$BASE/api/orgs" | json "d['id']")
expect "empresa criada" "$org" '^[0-9a-f-]{36}$'
(req -N --max-time 4 -D "$WORK/hs" "$BASE/api/orgs/$org/notifications/stream" > "$WORK/sse" 2>/dev/null || true)
expect "SSE → text/event-stream" "$(header "$WORK/hs" content-type)" 'text/event-stream'
expect "SSE sem buffering (evento ready imediato)" "$(cat "$WORK/sse")" 'event: ?ready'

type=$(req -H "X-XSRF-TOKEN: $(xsrf)" -H 'Content-Type: application/json' \
  -d '{"name":"Certificado de ensaio","subject":"EMPLOYEE","requiresExpiry":false,"alertDays":30}' \
  "$BASE/api/orgs/$org/document-types" | json "d['id']")
employee=$(req -H "X-XSRF-TOKEN: $(xsrf)" -H 'Content-Type: application/json' \
  -d '{"fullName":"Trabalhador Ensaio","category":"Servente"}' "$BASE/api/orgs/$org/employees" | json "d['id']")
{ printf '%%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n'; head -c 14000000 /dev/zero; printf '\n%%%%EOF\n'; } > "$WORK/14mb.pdf"
code=$(req -o "$WORK/doc.json" -w '%{http_code}' -H "X-XSRF-TOKEN: $(xsrf)" -F "typeId=$type" -F "employeeId=$employee" \
  -F "file=@$WORK/14mb.pdf;type=application/pdf" "$BASE/api/orgs/$org/documents")
expect "upload de 14 MB (S3 + ClamAV) → 2xx" "$code" '^20[01]$'
version=$(json "d['current']['id']" < "$WORK/doc.json")
scan=$("${COMPOSE[@]}" exec -T postgres psql -U postgres -d andaime -At \
  -c "SELECT scan_status FROM document_versions WHERE id = '$version'")
expect "documento analisado pelo ClamAV (scan_status)" "$scan" '^CLEAN$'
head -c 17000000 /dev/zero > "$WORK/17mb.pdf"
code=$(req -o /dev/null -w '%{http_code}' -H "X-XSRF-TOKEN: $(xsrf)" -F "typeId=$type" -F "employeeId=$employee" \
  -F "file=@$WORK/17mb.pdf;type=application/pdf" "$BASE/api/orgs/$org/documents")
expect "upload de 17 MB recusado (413)" "$code" '^413$'

echo
if [ "$FAILURES" -eq 0 ]; then echo "Ensaio de produção concluído sem falhas."; else echo "$FAILURES verificação(ões) falharam." >&2; exit 1; fi
