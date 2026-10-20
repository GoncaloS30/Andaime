# Runbooks de incidentes

Em qualquer incidente: abrir um registo com hora de início, impacto e pessoa responsável; comunicar aos clientes
afetados se houver indisponibilidade > 15 min ou qualquer suspeita de acesso indevido a dados; no fim, escrever um
post-mortem sem culpados (cronologia, causa, o que corrigir).

## API não responde / 5xx

1. `GET /actuator/health/readiness` em cada instância; logs com `requestId` dos pedidos que falham.
2. Base de dados acessível? Ligações esgotadas (`pg_stat_activity`)? Uma migração a meio (`flyway_schema_history`)?
3. Se começou com uma versão nova: rollback da aplicação (ver [deploy.md](deploy.md)).

## Base de dados lenta ou cheia

1. Consultas lentas: `pg_stat_statements`; comparar com os resultados de [carga.md](carga.md).
2. Espaço: `audit_event` e `spring_session` são as tabelas que mais crescem; as sessões expiradas são limpas a cada 15 min.
3. Nunca apagar `audit_event` (só acrescento, protegido por permissões).

## Suspeita de acesso entre empresas

1. Tratar como incidente de segurança grave (RGPD: notificação à autoridade em 72 h, se confirmado).
2. Identificar pedidos pelo `requestId` e as empresas envolvidas; consultar `audit_event` das duas empresas.
3. Verificar a RLS: `restore-test.sh` (secção "Segurança restaurada") contra uma cópia; correr a suite IDOR.
4. Se necessário, suspender a(s) empresa(s) em `/plataforma` enquanto se investiga.

## Pedido de ajuda de um cliente (acesso de suporte)

1. O dono ou administrador da empresa autoriza em **Definições → Regras e suporte**, com motivo e prazo (≤ 72 h).
2. O suporte entra pela própria conta; vê a empresa só de leitura, com aviso permanente no topo.
3. Cada consulta fica na auditoria da empresa (`support.viewed`); qualquer tentativa de alteração é recusada e registada.
4. No fim, o cliente (ou o suporte) revoga o acesso.

## Conta comprometida

1. Repor a palavra-passe (revoga todas as sessões da conta).
2. Rever `audit_event` da conta (`actor_user_id`) nas empresas onde é membro.
3. Se for administrador, rever convites e alterações de papéis recentes.

## Rodar segredos

- Base de dados: criar a nova palavra-passe do papel, atualizar o gestor de segredos, reiniciar as instâncias uma a uma.
- S3: criar uma chave nova, atualizar, reiniciar, e só depois revogar a antiga.
- Sessões: não há segredo de assinatura (sessões no PostgreSQL); para expulsar toda a gente, limpar `spring_session`.

## Empresa com ponto sem rede recusado

Toques sem rede com mais de 72 h ou fora de ordem são recusados e ficam visíveis na app do trabalhador. O encarregado
regista ou corrige as horas em **Horas da equipa** (fica revisão com motivo).
