# Segurança e proteção de dados

## Controlos implementados (a partir de F1)

| Ameaça | Controlo |
|---|---|
| Acesso a outra empresa (IDOR) | Org no URL + membership verificada por pedido (404 se não for membro); filtro por org na aplicação; FKs compostas; RLS forçada; suite de testes que enumera todas as rotas |
| Escalada de privilégios | Verificação de papel em cada serviço (`OrgRole.require`) com hierarquia OWNER > ADMIN > MANAGER > FOREMAN > WORKER; só OWNER atribui OWNER/ADMIN; o último OWNER não pode ser removido nem despromovido |
| Roubo de sessão | Cookie HttpOnly, Secure, SameSite=Lax; novo id de sessão no login; revogação de sessões; inatividade 8 h |
| CSRF | Token por cookie `XSRF-TOKEN` + cabeçalho `X-XSRF-TOKEN` em todas as mutações |
| Força bruta | Limite por IP em `/api/auth/**`; bloqueio exponencial por email; mensagens neutras |
| Enumeração de contas | `password/forgot` responde sempre 202; registo com email existente responde da mesma forma e envia aviso ao dono |
| Passwords fracas | Mínimo 12 caracteres, máximo 128; Argon2id |
| Tokens de email | 256 bits aleatórios, só o hash SHA-256 é guardado, uso único, validade curta |
| SQL injection | Só consultas parametrizadas (`JdbcTemplate`); fragmentos de SQL concatenados apenas a partir de constantes do código |
| XSS | React escapa por omissão; sem `dangerouslySetInnerHTML` com dados; cabeçalhos CSP/`X-Content-Type-Options`/`Referrer-Policy` no backend |
| Validação | Jakarta Bean Validation em todos os DTOs + regras de domínio nos serviços |
| Segredos | Variáveis de ambiente (`.env` fora do git; `.env.example` sem valores reais) |
| Logs | Sem passwords, tokens, cookies nem corpos de pedido; JSON estruturado com `requestId` |
| Ficheiros (F5) | Bucket privado; tamanho máximo; tipo detetado pelo conteúdo (Tika) e lista de tipos permitidos; chave aleatória; download sempre pela API após autorização, auditado, com `Content-Disposition: attachment`, `nosniff` e sem cache; estado de verificação antivírus (integração por fazer) |
| Auditoria | `audit_event` só por acrescento (trigger + permissões) |

## Minimização de dados por papel

- **Encarregado:** vê nome, categoria, foto e contacto profissional dos trabalhadores das equipas/obras que lidera; **não** vê custo/hora, nacionalidade, morada nem documentos pessoais completos (só o estado: válido/expira/em falta).
- **Trabalhador:** vê apenas os próprios dados, escalas, horas, ausências e documentos.
- **Gestor/Admin/Owner:** dados completos da sua organização.
- **Platform Admin:** metadados das organizações; dados de uma empresa só com acesso de suporte temporário e auditado.

## RGPD — decisões técnicas e dependências jurídicas

O Andaime implementa controlos técnicos que **apoiam** o cumprimento do RGPD; **não** declara conformidade legal. A validação jurídica é necessária antes da comercialização para:
- base legal de cada tratamento (contrato de trabalho, obrigação legal de registo de tempos);
- prazos de retenção por país;
- contrato de subcontratação (DPA) com cada cliente e com subprocessadores (alojamento, email, storage);
- requisitos de destacamento (A1, SIPSI, Limosa, Meldung, Carte BTP) — o catálogo é **ilustrativo** e configurável;
- política laboral (horas extra, feriados, descansos) — valores iniciais são sugestões.

Fora de âmbito sem análise de privacidade específica: geolocalização contínua, biometria.

## Operação

- HTTPS obrigatório em produção (terminação no reverse proxy; `Secure` nos cookies; HSTS).
- Backups cifrados e com restauro testado (F7: `scripts/ops/`, ver `docs/operacao/backups.md`).
- Actuator: só `health` na porta pública; `prometheus` e restantes apenas na porta de gestão interna (F7).

## Revisão de segurança F7 (2026-10-20)

Corrigido:
- `/actuator/prometheus` estava acessível a qualquer utilizador autenticado de qualquer empresa → fechado na porta pública.
- Ligações SSE sem limite por utilizador → máximo 5.
- Acesso de suporte da plataforma implementado como previsto: autorizado pela empresa, só leitura, temporário, auditado.
- Anonimização de ex-trabalhadores (RGPD), irreversível e auditada.

Verificado por testes: isolamento entre empresas em todas as rotas (suite IDOR, inclui as novas), RLS forçada após
restauro, uploads com tipo real, acesso de suporte (lê, não escreve, revogação imediata).

Por fazer antes de vender (fora do código ou dependente de decisões):
- Teste de intrusão externo e revisão de configuração do proxy (CSP do frontend, HSTS com preload).
- Antivírus aos ficheiros carregados (ClamAV) — a coluna `scan_status` já existe.
- Análise automática de vulnerabilidades das dependências Java (o CI já audita as do npm).
- Encriptação e localização dos backups; DPA com subprocessadores.

## Análise automatizada (2026-10-20)

**Dependências Java (OSV-Scanner sobre o SBOM CycloneDX das dependências de execução).** A primeira análise encontrou
17 vulnerabilidades conhecidas: Tomcat 11.0.24 (3 críticas, até CVSS 9,8) e Jackson 2.21.5/3.1.5 (altas). Corrigido
sobrepondo `tomcat.version` 11.0.27, `jackson-bom.version` 3.1.8 e `jackson-2-bom.version` 2.21.8 no `pom.xml`
(retirar quando o Spring Boot trouxer versões iguais ou superiores). A CI gera o SBOM e falha com qualquer
vulnerabilidade conhecida; o Dependabot cobre npm, Maven, a imagem Docker do backend e as ações do GitHub.

**Análise dinâmica (OWASP ZAP, `zap-api-scan.py` a partir do OpenAPI, sem sessão, contra a API local).** Sem alertas
de risco alto ou médio. Os de risco baixo foram tratados:

| Alerta | Tratamento |
|---|---|
| Cookie `XSRF-TOKEN` sem `SameSite` | Passa a `SameSite=Lax` (e `Secure` quando os cookies de sessão o são) |
| Cookie `XSRF-TOKEN` sem `HttpOnly` | Aceite: o SPA tem de ler o token para o enviar em `X-XSRF-TOKEN` (padrão de proteção CSRF) |
| `Cross-Origin-Resource-Policy` em falta | `same-origin` em todas as respostas |
| Página de erro HTML do Tomcat em multipart mal formado | Os erros do servlet passam pelo tratamento de erros do Spring (JSON); deixa de expor a página do servidor |

Limites: a análise foi feita sem sessão autenticada (a maior parte das rotas responde 401) e só contra a API; **não
substitui um teste de intrusão externo**, que continua necessário antes de produção.

