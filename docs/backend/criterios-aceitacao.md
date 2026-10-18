# Critérios de aceitação

## Gerais (aplicam-se a cada funcionalidade)

1. Os dados são guardados em PostgreSQL e permanecem após reiniciar a API.
2. Dois utilizadores autorizados veem alterações consistentes.
3. Um utilizador sem permissão recebe 403 (ou 404 se o recurso não for da sua empresa) e nada é alterado.
4. Uma empresa não acede a dados de outra (testado pela suite IDOR e pelos testes RLS).
5. O frontend usa a API real; não há dados fictícios no caminho de produção.
6. Validação no backend; erros apresentados no campo certo, em pt-PT.
7. Operações críticas ficam em `audit_event`.
8. Testes relevantes (unitários, integração com Testcontainers, API, E2E) passam e a saída é mostrada no relatório da fase.

## Por módulo

| Módulo | Critérios específicos |
|---|---|
| Autenticação (F1) | Registo → verificação por email → entrada; sessão expira; logout invalida; reposição de password invalida todas as sessões; 5 falhas seguidas bloqueiam temporariamente; CSRF obrigatório; nenhum token no `localStorage` |
| Organizações (F1) | Criar empresa torna o criador OWNER e cria política laboral e regras de conflito por omissão; convidar → aceitar com o mesmo email; mudar papel com `version`; último OWNER protegido; utilizador com duas empresas troca de empresa sem misturar dados |
| Trabalhadores (F2) | CRUD com número único por empresa; arquivar sem perder histórico; encarregado não vê custo/hora; histórico de alterações consultável |
| Obras (F2) | Código único; fuso derivado do país e editável; métricas a partir de registos reais (zero sem registos) |
| Equipas (F2) | Entrada/saída com datas; mudar composição não altera semanas anteriores |
| Planeamento (F3) | Sobreposição de horário rejeitada pela BD mesmo com dois pedidos simultâneos; várias obras no mesmo dia sem sobreposição permitidas; regras block/warn por empresa; pré-visualização não grava; copiar semana/transferir atómicos; anular via change-set falha se alguém alterou entretanto |
| Viaturas (F3) | Viatura em duas obras em períodos sobrepostos rejeitada; inspeção/seguro expirados sinalizados; atribuição visível no planeamento e na ficha |
| Horas (F4) | Ponto idempotente; turno noturno; duas obras no mesmo dia; sobreposição rejeitada; correção preserva original; folha aprovada imutável sem reabrir; horas extra segundo a política da empresa e país |
| Aprovações (F4) | Transições válidas apenas; dupla aprovação concorrente → uma vence, a outra recebe 409; autor, data e motivo registados |
| Ausências (F5) | Aprovar com conflitos `block` impede; com atribuições existentes exige resolução explícita; reflete-se na disponibilidade |
| Documentos (F5) | Upload real com validação; download só autorizado; versões; alertas de validade; ficheiros nunca públicos |
| Equipamentos (F5) | Stock nunca negativo, mesmo em concorrência; unidade com série com um único titular |
| Relatórios (F6) | Totais coincidem com registos aprovados; Excel gerado no servidor com os 4 modelos; limites e exportação assíncrona |
