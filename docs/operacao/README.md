# Operação do Andaime

Guias para pôr o Andaime em produção e mantê-lo. **Nenhum deploy nem recurso pago é criado sem autorização.**

| Guia | Para quê |
|---|---|
| [deploy.md](deploy.md) | Produção com Docker Compose (`infra/compose.prod.yaml`) passo a passo; checklist antes, durante e depois de cada versão; variáveis de ambiente; migrações e rollback |
| [backups.md](backups.md) | Backups da base de dados e dos ficheiros, restauro testado, objetivos de recuperação |
| [incidentes.md](incidentes.md) | Runbooks: API em baixo, base de dados, suspeita de fuga entre empresas, acesso de suporte, segredos |
| [carga.md](carga.md) | Teste de carga com 1000 trabalhadores e 90 dias: método e resultados |

Arquitetura de produção recomendada (a decidir com o cliente/fornecedor):

- Reverse proxy com TLS (HSTS, HTTP/2, compressão) a servir o frontend estático e a encaminhar `/api` para a API.
- API Spring Boot (imagem `backend/Dockerfile`) em 2+ instâncias sem estado (sessões no PostgreSQL).
- PostgreSQL 18 gerido ou próprio, com arquivo contínuo de WAL e backups diários.
- Armazenamento compatível com S3 com versionamento e encriptação.
- SMTP transacional para os emails (verificação, convites, recuperação).
- Métricas Prometheus na porta de gestão interna (`ANDAIME_MANAGEMENT_PORT`, 8098), nunca exposta pelo proxy.
