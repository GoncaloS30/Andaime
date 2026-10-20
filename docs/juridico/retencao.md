# Conservação de dados — proposta e estado atual

> Proposta técnica a validar por jurista. Os prazos legais citados são pontos de partida para a revisão, não
> conclusões. Onde a lei permitir escolha, o prazo deve ser configurável por empresa.

## O que o sistema faz hoje

| Dados | Comportamento atual |
|---|---|
| Ex-trabalhadores | Ficam arquivados sem prazo. A **anonimização é manual** (administrador, "Anonimizar"): apaga nome, contactos, nacionalidade, morada, admissão, custo, competências, tamanhos, notas, contratos e fotografia; desativa a conta ligada; arquiva os documentos. Mantém número, categoria e o histórico de horas e planeamento sem identificação. |
| Documentos | Versões antigas e documentos arquivados ficam no armazenamento **sem prazo**. A anonimização arquiva-os mas **não apaga os ficheiros** — lacuna. |
| Registos de horas, folhas, ausências, planeamento | Sem prazo. |
| Auditoria (`audit_event`) | Só de acrescento, sem prazo (a tabela pode ser particionada por mês para apagar por partições). |
| Notificações | Sem prazo. |
| Exportações XLSX | O ficheiro expira às 24 h; o registo do pedido fica. |
| Sessões | 8 h de inatividade, 7 dias no máximo; limpeza a cada 15 min. |
| Tokens de verificação/reposição/convite | Expiram, mas as linhas ficam. |
| Bloqueio por tentativas (`login_throttle`) | Apagado no login bem-sucedido; senão fica. |
| Backups | Proposta operacional: diários 35 dias, mensais 12 meses ([../operacao/backups.md](../operacao/backups.md)). Dados apagados na base continuam nos backups até expirarem. |

## Proposta (a validar)

| Categoria | Prazo proposto | Ponto de partida legal a confirmar | Ação técnica proposta |
|---|---|---|---|
| Registo de tempos de trabalho (picagens, registos, correções, folhas aprovadas) e ausências | 5 anos após o registo | Código do Trabalho, art. 202.º (conservação do registo de tempos de trabalho) | Job anual que apaga/anonimiza registos com mais de 5 anos |
| Dados de horas usados em faturação/ERP e exportações | 10 anos | Prazos fiscais e contabilísticos de conservação de documentos | Manter só os factos agregados necessários, sem dados pessoais além do número |
| Ficha do ex-trabalhador (dados pessoais) | 1 ano após a cessação, salvo litígio | Prescrição dos créditos laborais (Código do Trabalho, art. 337.º) | **Anonimização automática** configurável (hoje é manual) |
| Ficha de aptidão médica | Substituída: apagar a versão anterior; cessação: apagar | Lei n.º 102/2009 (SST); confirmar se a empresa deve guardar cópia | Apagar ficheiros de versões substituídas; apagar à cessação |
| Documento de identificação, carta de condução | Até à cessação do contrato | Minimização (art. 5.º, n.º 1, c) e e)) | Apagar ficheiros na anonimização (corrigir a lacuna) |
| Certificado A1 e documentos de destacamento | Duração do destacamento + prazo exigido pelo país de acolhimento | Regras nacionais de transposição da Diretiva 2014/67/UE — variam por país | Prazo por tipo de documento e país, configurável |
| Fardamento/EPI (entregas) | Enquanto houver material atribuído + 2 anos | A confirmar (SST) | Anonimizar com a ficha |
| Auditoria | Alterações de horas e aprovações: 5 anos (acompanha o registo de tempos); restante: 2 anos | Interesse legítimo (segurança), proporcionalidade | Partições mensais e remoção por partição |
| Notificações | 12 meses | Minimização | Job de limpeza |
| Contas de utilizador sem empresa ativa | 24 meses sem atividade, com aviso prévio por email | Minimização | Job de limpeza com aviso |
| Tokens e bloqueios de login | Após expirar / 30 dias | Minimização | Job de limpeza |

## Trabalho técnico decorrente (depois da validação)

1. Apagar os ficheiros dos documentos na anonimização e as versões substituídas da ficha de aptidão.
2. Política de retenção por empresa (com os mínimos legais como limite inferior) e job diário por empresa, com o mesmo
   padrão dos jobs atuais (uma transação por empresa, lock consultivo, auditoria do que foi apagado).
3. Particionar `audit_event` por mês.
4. Limpeza de tokens, bloqueios e notificações antigas.
