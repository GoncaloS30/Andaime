# Segurança e proteção de dados

## Controlos implementados (a partir de F1)

| Ameaça | Controlo |
|---|---|
| Acesso a outra empresa (IDOR) | Org no URL + membership verificada por pedido (404 se não for membro); filtro por org na aplicação; FKs compostas; RLS forçada; suite de testes que enumera todas as rotas |
| Escalada de privilégios | `@PreAuthorize` com hierarquia OWNER > ADMIN > MANAGER > FOREMAN > WORKER; só OWNER atribui OWNER/ADMIN; o último OWNER não pode ser removido nem despromovido |
| Roubo de sessão | Cookie HttpOnly, Secure, SameSite=Lax; novo id de sessão no login; revogação de sessões; inatividade 8 h |
| CSRF | Token por cookie `XSRF-TOKEN` + cabeçalho `X-XSRF-TOKEN` em todas as mutações |
| Força bruta | Limite por IP em `/api/auth/**`; bloqueio exponencial por email; mensagens neutras |
| Enumeração de contas | `password/forgot` responde sempre 202; registo com email existente responde da mesma forma e envia aviso ao dono |
| Passwords fracas | Mínimo 12 caracteres, máximo 128; Argon2id |
| Tokens de email | 256 bits aleatórios, só o hash SHA-256 é guardado, uso único, validade curta |
| SQL injection | Só JPA/consultas parametrizadas; nenhum SQL concatenado |
| XSS | React escapa por omissão; sem `dangerouslySetInnerHTML` com dados; cabeçalhos CSP/`X-Content-Type-Options`/`Referrer-Policy` no backend |
| Validação | Jakarta Bean Validation em todos os DTOs + regras de domínio nos serviços |
| Segredos | Variáveis de ambiente (`.env` fora do git; `.env.example` sem valores reais) |
| Logs | Sem passwords, tokens, cookies nem corpos de pedido; JSON estruturado com `requestId` |
| Ficheiros (F5) | Bucket privado; tamanho máximo; tipo detetado pelo conteúdo (Tika) e lista de tipos permitidos; chave aleatória; download só por URL pré-assinado curto após autorização; estado de verificação antivírus |
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
- Backups cifrados e com restauro testado (F7).
- Actuator: só `health` público; `prometheus` e restantes atrás de autenticação/rede interna.
