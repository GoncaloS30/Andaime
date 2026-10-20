# Avaliação de impacto (AIPD) — esboço

> Esboço para o responsável pelo tratamento (empresa cliente) e para o jurista. Decide-se primeiro se a AIPD é
> obrigatória: o tratamento envolve dados de trabalhadores (titulares em posição de dependência), dados de saúde e
> registo sistemático do tempo de trabalho — critérios que, combinados, costumam apontar para a necessidade de AIPD
> (art. 35.º e lista da CNPD, Regulamento n.º 1/2018). **Confirmar.**

## 1. Descrição do tratamento

Planeamento de obras e equipas, registo de ponto e de tempos, aprovação semanal de horas, ausências, documentos de
conformidade (incluindo ficha de aptidão médica e A1), fardamento/EPI, viaturas, relatórios e exportação para ERP.
Inventário completo em [registo-tratamentos.md](registo-tratamentos.md).

## 2. Necessidade e proporcionalidade

- Cada dado tem finalidade ligada à gestão do trabalho ou a obrigação legal (ver registo).
- **Sem** geolocalização de trabalhadores, **sem** biometria, **sem** monitorização de dispositivos; o ponto regista a
  hora do servidor e a hora indicada pelo dispositivo.
- Dados pessoais sensíveis limitados: o encarregado não vê contactos, nacionalidade, custo nem notas; o trabalhador só
  vê os seus dados.
- Prazos de conservação: proposta em [retencao.md](retencao.md); **hoje não há eliminação automática** — risco.

## 3. Riscos e medidas

| Risco | Prob./gravidade (a avaliar) | Medidas existentes | Lacunas / a fazer |
|---|---|---|---|
| Acesso de uma empresa aos dados de outra | Baixa / muito alta | Empresa no URL + RLS no PostgreSQL + chaves compostas; suite de testes IDOR em cada alteração | Teste de intrusão externo |
| Acesso indevido dentro da empresa (ex.: encarregado vê dados de saúde) | Média / alta | Papéis e âmbitos verificados no servidor; campos restritos para o encarregado | Decidir se o tipo "doença" e a ficha de aptidão ficam só para gestores |
| Conta comprometida | Média / alta | Argon2id, limite de tentativas, sessões revogáveis, reposição com revogação de sessões | Autenticação de dois fatores (não existe) |
| Ficheiro malicioso carregado | Média / média | Tipo verificado pelo conteúdo, antivírus ClamAV em produção (falha fechada), ficheiros nunca públicos | Teste com ClamAV real em produção; atualização de assinaturas monitorizada |
| Conservação excessiva | Alta / média | Anonimização manual de ex-trabalhadores | Eliminação automática ([retencao.md](retencao.md)) |
| Acesso do fornecedor (suporte) | Baixa / alta | Acesso só com autorização da empresa, temporário (1–72 h), só de leitura e auditado | Cláusula no contrato de subcontratação |
| Perda de dados | Baixa / alta | Backups com teste de restauro automatizado | Definir RPO/RTO com clientes; cópia noutra região |
| Violação de dados não detetada | Média / alta | Auditoria só de acrescento, runbook de incidentes | Monitorização e alertas em produção (dependem do fornecedor escolhido) |
| Vulnerabilidades em dependências | Média / alta | npm audit e OSV-Scanner na CI (falham a CI), Dependabot, análise ZAP | Processo de atualização com prazo para correções críticas |
| Transferências internacionais | Depende do fornecedor | — | Escolher alojamento e email no EEE ou com garantias adequadas |

## 4. Direitos dos titulares

- Acesso/portabilidade: o trabalhador vê os seus registos, folhas, ausências e documentos na app; falta uma
  **exportação dos dados do titular** num ficheiro (a fazer).
- Retificação: correções de registos com motivo e histórico; ficha editável pelos gestores.
- Apagamento: anonimização de ex-trabalhadores (manual); limites pelas obrigações legais de conservação.
- Oposição/limitação: avaliar caso a caso; os avisos por email podem ser desligados pelo próprio.

## 5. Conclusão (a preencher pelo responsável)

Riscos residuais aceites, medidas a implementar com prazo, parecer do encarregado de proteção de dados e, se o risco
residual for elevado, consulta prévia à CNPD (art. 36.º).
