# Dossier de proteção de dados e regras laborais — rascunho técnico

> **Isto não é aconselhamento jurídico nem uma declaração de conformidade.** É o levantamento técnico do que o
> Andaime guarda e faz, preparado para um jurista/encarregado de proteção de dados validar antes da venda a empresas
> reais. Os prazos e as regras por país são **propostas a confirmar**; as referências legais servem para orientar a
> revisão e podem estar incompletas ou desatualizadas.

| Documento | Para quê |
|---|---|
| [registo-tratamentos.md](registo-tratamentos.md) | Base do registo das atividades de tratamento (RGPD, art. 30.º), do lado da empresa cliente e do lado do Andaime |
| [retencao.md](retencao.md) | Proposta de prazos de conservação por categoria de dados e o que o sistema já faz (ou ainda não faz) |
| [aipd-esboco.md](aipd-esboco.md) | Esboço da avaliação de impacto (AIPD, art. 35.º): riscos, medidas existentes e lacunas |
| [regras-por-pais.md](regras-por-pais.md) | Regras laborais e documentais configuráveis que dependem do país e precisam de validação |

## Papéis (proposta)

- **Empresa cliente** (a construtora que usa o Andaime): **responsável pelo tratamento** dos dados dos seus
  trabalhadores, obras e clientes.
- **Andaime** (fornecedor do SaaS): **subcontratante** (art. 28.º) para esses dados — trata-os só por instrução da
  empresa cliente — e **responsável** pelos dados das contas de utilizador para efeitos de autenticação, segurança e
  faturação do serviço.
- Subcontratantes ulteriores (alojamento, base de dados, armazenamento de ficheiros, envio de email) só ficam definidos
  com a escolha do fornecedor de produção — ver [../operacao/deploy.md](../operacao/deploy.md). Têm de constar do
  contrato de subcontratação e, se estiverem fora do EEE, ter mecanismo de transferência (art. 44.º e seguintes).

## O que falta decidir/fazer fora do código

1. Contrato de subcontratação (art. 28.º, n.º 3) e termos de serviço; lista pública de subcontratantes ulteriores.
2. Política de privacidade para utilizadores e texto informativo que a empresa cliente entrega aos trabalhadores
   (arts. 13.º e 14.º).
3. Validação dos prazos de [retencao.md](retencao.md) e configuração por empresa onde a lei o permitir.
4. Decisão sobre a necessidade de AIPD formal por cada empresa cliente (lista da CNPD, Regulamento n.º 1/2018) e
   sobre o encarregado de proteção de dados do Andaime (art. 37.º).
5. Procedimento de violação de dados (notificação à CNPD em 72 h, art. 33.º) — a parte técnica está em
   [../operacao/incidentes.md](../operacao/incidentes.md).
6. Teste de intrusão externo antes de produção (a análise automática ZAP não o substitui).
