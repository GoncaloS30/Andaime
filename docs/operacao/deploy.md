# Deploy, migrações e rollback

## Variáveis de ambiente do backend (produção, perfil `prod`)

Nomes tal como o backend os lê. Com o Docker Compose de produção (secção seguinte) preenche-se só o
`infra/.env.prod` (modelo comentado em [`infra/.env.prod.example`](../../infra/.env.prod.example)); o
`infra/compose.prod.yaml` faz a correspondência e recusa arrancar se faltar uma variável obrigatória.

| Variável | Obrigatória | Notas |
|---|---|---|
| `SPRING_PROFILES_ACTIVE=prod` | sim | Cookies `Secure`, Swagger desligado, `flyway clean` desligado, antivírus `clamd` por omissão |
| `ANDAIME_PUBLICURL` (`andaime.public-url`) | sim | Endereço público, usado nos links dos emails (verificação, reposição, convites) |
| `ANDAIME_DATABASE_URL` | sim | `jdbc:postgresql://…/andaime` |
| `ANDAIME_DATABASE_USER` / `_PASSWORD` | sim | Papel `andaime_app` (só DML, sem BYPASSRLS) |
| `ANDAIME_DATABASE_OWNER` / `_OWNER_PASSWORD` | sim | Papel `andaime_owner`, só para as migrações Flyway |
| `ANDAIME_PLATFORMDATASOURCE_USERNAME` / `_PASSWORD` | sim | Papel `andaime_platform` (BYPASSRLS, só leitura/estado de organizações); sem isto usa a palavra-passe de desenvolvimento |
| `ANDAIME_STORAGE_ENDPOINT` / `_REGION` / `_BUCKET` | sim | S3 privado (acesso *path-style*) |
| `ANDAIME_STORAGE_ACCESS_KEY` / `_SECRET_KEY` | sim | Sem valor por omissão em `prod` |
| `ANDAIME_MAIL_HOST` / `_PORT` | sim | SMTP transacional (587 + STARTTLS) |
| `SPRING_MAIL_USERNAME` / `SPRING_MAIL_PASSWORD` | sim | Credenciais SMTP |
| `ANDAIME_MAIL_FROM` (`andaime.mail.from`) | sim | Remetente (cabeçalho `From`), ex. `Andaime <nao-responder@exemplo.pt>`; sem valor por omissão em `prod` |
| `SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH` / `_STARTTLS_ENABLE` / `_STARTTLS_REQUIRED` | sim | `true` em produção |
| `ANDAIME_ANTIVIRUS_MODE` / `_HOST` / `_PORT` / `_TIMEOUT_MS` | não (`clamd`, `clamav`, 3310, 30000) | Falha fechada: sem clamd, uploads → 503 |
| `ANDAIME_TOTP_KEY` | sim | Chave AES-256 (base64, 32 bytes; `openssl rand -base64 32`) que cifra os segredos da verificação em dois passos. Sem valor por omissão fora dos perfis `local`/`test`; trocá-la invalida a 2FA já configurada |
| `ANDAIME_MANAGEMENT_PORT` | não (8098) | Métricas internas |

Os segredos vêm do `infra/.env.prod` na VM (permissões 600) ou do gestor de segredos da plataforma; nunca do
repositório. Em produção os papéis da base de dados são criados por `infra/postgres/init-prod/00-roles.sh` (palavras-passe
do ambiente); o `infra/postgres/init/00-roles.sql` é só de desenvolvimento.

## Produção com Docker Compose

Uma VM com Docker corre o nginx (SPA + proxy de `/api`), o backend, o PostgreSQL e o ClamAV. O TLS termina à frente
(balanceador do fornecedor ou Caddy) e os documentos vão para um S3 gerido.

```text
Internet ──TLS──▶ balanceador do fornecedor  ou  Caddy (perfil "caddy")
                         │ HTTP + X-Forwarded-For/Proto
                         ▼
                 web (nginx, porta 8080) ── /api ──▶ backend (8088; gestão 8098 só interna)
                   SPA, cabeçalhos, gzip                │        │          │
                                                        ▼        ▼          ▼
                                              postgres (rede   clamav    S3 gerido + SMTP
                                              interna "data")  (3310)    (fora da VM)
```

Ficheiros:

| Ficheiro | O quê |
|---|---|
| `infra/compose.prod.yaml` | Serviços `web`, `backend`, `postgres`, `clamav` e `caddy` (opcional, perfil `caddy`) |
| `infra/.env.prod.example` | Todas as variáveis, comentadas; copiar para `infra/.env.prod` (no `.gitignore`) |
| `infra/web/Dockerfile` | Imagem do frontend: `node` (versão do `.nvmrc`) → `npm ci && npm run build` → `nginx-unprivileged` |
| `infra/web/nginx.conf` + `proxy-headers.conf` | Fallback da SPA, cache, proxy de `/api` (`X-Forwarded-*`, SSE sem buffering, 503 em JSON se o backend cair), 16 MB de upload, gzip, `/actuator/*` → 404 |
| `infra/web/security-headers.conf` | CSP, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS (só atrás de TLS) |
| `infra/postgres/init-prod/00-roles.sh` | Cria `andaime_owner`, `andaime_app` e `andaime_platform` com as palavras-passe do `.env.prod` |
| `infra/caddy/Caddyfile` | TLS automático (Let's Encrypt) para `ANDAIME_DOMAIN` |
| `infra/compose.prod-smoke.yaml` + `scripts/ops/prod-smoke.sh` | Ensaio local completo da stack (ver abaixo) |

### Pré-requisitos

- **VM Linux com Docker Engine e o plugin Compose** (v2.24 ou superior), numa região da UE. Mínimo 2 vCPU / 4 GB de RAM;
  recomendado 4 vCPU / 8 GB (o ClamAV usa ~1,5 GB, e o dobro durante a recarga das assinaturas). 40 GB de disco.
  Exemplos: Hetzner Cloud, OVHcloud, Scaleway, DigitalOcean (Frankfurt/Amesterdão), AWS/Azure/GCP em regiões da UE.
- **Domínio** com um registo DNS `A`/`AAAA` para a VM (ou para o balanceador).
- **TLS:** o balanceador do fornecedor com certificado gerido (encaminha HTTP para `IP-privado:8080` da VM) **ou** o
  Caddy deste Compose (`--profile caddy`, portas 80/443 abertas, Let's Encrypt automático). O nginx só confia no
  `X-Forwarded-For` de proxies em redes privadas (10/8, 172.16/12, 192.168/16, fc00::/7); se o balanceador usar outros
  endereços, acrescentar `set_real_ip_from` em `infra/web/nginx.conf`.
- **S3 gerido na UE**, bucket privado sem acesso público e com versionamento, e uma chave limitada a esse bucket.
  Exemplos: Hetzner Object Storage, OVHcloud Object Storage, Scaleway Object Storage, AWS S3 (`eu-*`), Backblaze B2 (EU).
  O SeaweedFS do `infra/compose.yaml` é só para desenvolvimento e não faz parte do Compose de produção.
- **Email transacional na UE** com SMTP (porta 587, STARTTLS) e domínio remetente verificado (SPF, DKIM, DMARC).
  Exemplos: Brevo, Mailjet, Scaleway TEM, Amazon SES (`eu-*`), Mailgun (região UE).
- **Opcional — PostgreSQL gerido** (PostgreSQL 18, por causa de `uuidv7()`) em vez do contentor: Scaleway, OVHcloud,
  DigitalOcean, Aiven, AWS RDS. Confirmar que o fornecedor permite criar papéis com `BYPASSRLS` (necessário para
  `andaime_owner` e `andaime_platform`) e as extensões `citext` e `btree_gist`. Ver "PostgreSQL gerido" abaixo.
- Para cada fornecedor: contrato de subcontratação (DPA, RGPD) e dados alojados na UE (ver [seguranca.md](../backend/seguranca.md)).

### Primeiro deploy, passo a passo

```bash
# 1. Na VM (utilizador com acesso ao Docker): código na versão a publicar
git clone https://github.com/GoncaloS30/Andaime.git /opt/andaime && cd /opt/andaime
git checkout v3.1.0                      # tag testada no CI

# 2. Segredos (gerar cada palavra-passe/chave com: openssl rand -base64 36 | tr -d '/+=')
cp infra/.env.prod.example infra/.env.prod && chmod 600 infra/.env.prod
nano infra/.env.prod                     # preencher TODOS os valores "substituir-…"; ANDAIME_VERSION=3.1.0

# 3. Validar (falha com a mensagem da variável em falta)
docker compose -f infra/compose.prod.yaml --env-file infra/.env.prod config -q

# 4. Construir e arrancar (acrescentar "--profile caddy" se o TLS for feito pelo Caddy)
docker compose -f infra/compose.prod.yaml --env-file infra/.env.prod up -d --build --wait

# 5. Estado e logs
docker compose -f infra/compose.prod.yaml --env-file infra/.env.prod ps
docker compose -f infra/compose.prod.yaml --env-file infra/.env.prod logs -f backend
curl -fsS http://127.0.0.1:8080/healthz && curl -fsS http://127.0.0.1:8080/api/auth/csrf
```

Para não repetir os argumentos: `alias dc='docker compose -f infra/compose.prod.yaml --env-file infra/.env.prod'`.

**O que acontece no primeiro arranque:**

1. O PostgreSQL inicializa o volume e corre `00-roles.sh` (papéis e permissões). Só acontece com o volume vazio: mudar
   depois as palavras-passe no `.env.prod` **não** altera os papéis (usar `ALTER ROLE … PASSWORD` como `postgres`).
2. O backend arranca e o **Flyway aplica todas as migrações como `andaime_owner`**; a aplicação liga-se depois como
   `andaime_app` (sempre sujeita a RLS). O `web` só arranca quando `/actuator/health/readiness` (porta de gestão 8098) está `UP`.
3. O ClamAV descarrega as assinaturas (alguns minutos na primeira vez). Até estar pronto, os uploads respondem
   503 `antivirus-unavailable` (falha fechada); o resto da aplicação funciona.

### Primeiro administrador da plataforma

De propósito, não há endpoint para isto. Registar a conta normalmente na aplicação (e confirmar o email) e depois:

```bash
docker compose -f infra/compose.prod.yaml --env-file infra/.env.prod exec postgres \
  psql -U postgres -d andaime -c \
  "INSERT INTO platform_admins (user_id) SELECT id FROM users WHERE email = 'admin@exemplo.pt' RETURNING user_id"
```

Ao entrar de novo, a conta vê a consola da plataforma (`/api/platform/orgs`). Revogar: `DELETE FROM platform_admins
WHERE user_id = …` (tem efeito imediato). Com PostgreSQL gerido, executar o mesmo `INSERT` como `andaime_owner`.

### Métricas

O Prometheus do backend está em `http://backend:8098/actuator/prometheus`, só na rede interna do Compose: nem o nginx
o encaminha (`/actuator/*` → 404) nem a porta é publicada. Para recolher métricas, ligar um Prometheus/agent à rede
`andaime-prod_edge` (ou publicar `127.0.0.1:8098` num ficheiro de override local).

### Backups

Os scripts de [backups.md](backups.md) funcionam com este Compose indicando o contentor do PostgreSQL:

```bash
export ANDAIME_PG_CONTAINER=$(docker compose -f infra/compose.prod.yaml --env-file infra/.env.prod ps -q postgres)
scripts/ops/backup.sh /srv/backups/andaime/$(date +%Y%m%d-%H%M%S)   # agendar diariamente (cron/systemd timer)
scripts/ops/restore-test.sh /srv/backups/andaime/<pasta>            # ensaio de restauro
```

Copiar os backups para fora da VM (outro fornecedor/região, cifrados), ativar o arquivo de WAL (pgBackRest/WAL-G) e o
versionamento do bucket S3, como descrito em [backups.md](backups.md). Guardar o `infra/.env.prod` num cofre: sem ele
(em particular sem a `ANDAIME_TOTP_KEY`) um restauro não fica completo.

### Atualizar e voltar atrás

```bash
cd /opt/andaime && git fetch --tags && git checkout v3.2.0
sed -i 's/^ANDAIME_VERSION=.*/ANDAIME_VERSION=3.2.0/' infra/.env.prod
scripts/ops/backup.sh /srv/backups/andaime/pre-3.2.0                 # com ANDAIME_PG_CONTAINER definido
docker compose -f infra/compose.prod.yaml --env-file infra/.env.prod build
docker compose -f infra/compose.prod.yaml --env-file infra/.env.prod up -d --wait
```

As migrações novas correm no arranque do backend. As imagens ficam etiquetadas com `ANDAIME_VERSION`, por isso a
versão anterior continua disponível localmente. **Rollback da aplicação:** voltar a `ANDAIME_VERSION` anterior (e ao
`git checkout` correspondente) e `up -d --wait`; como as migrações são só *expand* (ver abaixo), a versão anterior
funciona com o esquema novo (o Flyway ignora migrações "futuras"). Nunca apagar migrações aplicadas; dados corrompidos
→ restauro *point-in-time* ([backups.md](backups.md)). Atualizar as imagens base (`postgres`, `clamav`, `nginx`) com o
mesmo cuidado: o PostgreSQL só dentro da versão 18 (uma versão principal nova exige `pg_upgrade` ou dump/restore).

### PostgreSQL gerido

1. Criar a base `andaime` e, como administrador do serviço, os papéis com os comandos de
   `infra/postgres/init-prod/00-roles.sh` (palavras-passe próprias).
2. Em `infra/.env.prod`: `ANDAIME_DATABASE_URL=jdbc:postgresql://<host>:5432/andaime?sslmode=verify-full` (ou o modo
   TLS indicado pelo fornecedor) e as três palavras-passe; `POSTGRES_PASSWORD` pode ficar com um valor qualquer.
3. Retirar o serviço `postgres` (override local com `docker compose … up -d web backend clamav`, ou apagar o serviço
   e o `depends_on` numa cópia do ficheiro). Os backups passam a ser os do fornecedor (PITR ativo).

### Ensaio local (antes do primeiro deploy e depois de mexer no `infra/`)

```bash
scripts/ops/prod-smoke.sh            # no WSL/Linux com Docker; KEEP=1 para deixar a stack a correr
```

Constrói as imagens, arranca a stack de produção com segredos descartáveis (projeto `andaime-prodtest`, porta 18480),
acrescenta um SMTP (Mailpit) e um S3 (SeaweedFS) locais, e verifica pelo nginx: SPA e *deep links*, cabeçalhos de
segurança, cache, gzip, `/actuator/*` fechado, CSRF, registo → email (remetente e link públicos) → login com cookie
`Secure`, administrador da plataforma (papel `andaime_platform`), SSE sem buffering, upload de 14 MB para o S3 com
análise ClamAV `CLEAN` e upload de 17 MB recusado (413). No fim apaga contentores, volumes e rede do projeto.

### O que tem de ser feito pelo responsável (fora do repositório)

- Escolher e contratar os fornecedores (VM, S3, email e, se for o caso, PostgreSQL gerido e balanceador), aceitar os
  DPA e pagar os recursos. Nada disto é criado pelo código.
- Registar/configurar o domínio: DNS da aplicação, SPF/DKIM/DMARC do remetente.
- Criar o bucket privado (com versionamento) e uma chave limitada a ele; criar as credenciais SMTP.
- Gerar e guardar os segredos do `infra/.env.prod` (palavras-passe, chaves S3/SMTP, `ANDAIME_TOTP_KEY`) num cofre.
- Configurar a firewall da VM (só 80/443 ou balanceador → 8080; SSH restrito) e as atualizações automáticas do SO.
- Agendar os backups, copiá-los para fora da VM e fazer o ensaio de restauro mensal.
- Criar o primeiro administrador da plataforma (acima) e uma empresa de teste para o teste de fumo.
- Ligar a monitorização (métricas, alertas de disco/memória, verificação externa de `https://<domínio>/healthz`).

## Checklist antes do deploy

- [ ] CI verde no `main`: qualidade, build, backend (Testcontainers), E2E do protótipo e E2E full-stack (inclui acessibilidade).
- [ ] Notas da versão revistas (`CHANGELOG.md`); migrações novas identificadas e revistas (só *expand*, ver abaixo).
- [ ] Backup recente verificado (`scripts/ops/restore-test.sh` < 24 h) e WAL a arquivar.
- [ ] Imagem construída a partir da tag do `main`, com o mesmo `andaime-api-*.jar` testado.
- [ ] Janela combinada se houver migração longa (índices grandes: `CREATE INDEX CONCURRENTLY` numa migração própria).

## Durante

1. Aplicar a imagem nova numa instância (as migrações Flyway correm no arranque, como `andaime_owner`).
2. Verificar `GET /actuator/health/readiness` = `UP` na porta de gestão 8098 (com o perfil `prod` o Actuator não existe na 8088; no Compose: `docker compose … ps` mostra `healthy`) e os logs (sem `ERROR` no arranque).
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
