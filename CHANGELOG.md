# Registo de alterações

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/); versões em [SemVer](https://semver.org/lang/pt-BR/).

## [Por publicar]

### Acrescentado
- Backend SaaS (`backend/`, Spring Boot 4.1, PostgreSQL 18, Flyway): contas com sessões seguras, verificação de email, recuperação de palavra-passe, empresas com isolamento por RLS, papéis (proprietário, administrador, gestor, encarregado, trabalhador), convites, auditoria e administração da plataforma.
- Aplicação real ligada à API (`src/saas/`): entrar, registar, convites, criar empresa, troca de empresa, definições da empresa, equipa e acessos, sessões e auditoria.
- E2E de ponta a ponta contra a API real (`npm run e2e:saas`).
- Trabalhadores, equipas (composição datada), obras, clientes, mapa de obras e ocorrências ligados à API, com âmbito por papel e histórico auditado.
- Empresa de demonstração no backend por comando explícito e idempotente.
- Planeamento ligado ao servidor: quadro semanal com arrastar, escalas e cópia de semana com pré-visualização, conflitos verificados no servidor (sobreposições impossíveis de gravar), confirmação de avisos e "Anular" seguro.
- Horas: ponto na app do trabalhador (à prova de repetições), registos e correções com histórico, presenças confirmadas pelo encarregado, horas normais e extra pela política da empresa, folhas semanais com submeter/aprovar/devolver/reabrir e semanas aprovadas fechadas.
- Documentos com ficheiros reais (armazenamento S3 privado), versões, exigências por país, conformidade e alertas de validade; ausências com impacto explícito no planeamento; fardamento e EPI com stock e registo de entregas; notificações na aplicação em tempo real.
- Acesso de suporte temporário, só de leitura e auditado, autorizado pela empresa; ponto sem rede no telemóvel; política laboral e feriados editáveis; anonimização de ex-trabalhadores; documentos das viaturas.
- Operação: backups com restauro testado, runbooks, checklist de deploy e rollback; teste de carga com 1000 trabalhadores; E2E full-stack e acessibilidade (WCAG 2.1 AA) no CI.
- Avisos importantes também por email (ausências, folhas devolvidas, documentos a caducar), com opção de desligar por empresa.
- Fotografias de trabalhadores e obras, guardadas no armazenamento privado.
- Antivírus (ClamAV) aos documentos e fotografias carregados, ligado por omissão em produção.
- Mapas semanais (equipa, obra, horas, ERP) e relatórios calculados no servidor a partir de planeamento e horas aprovadas; Excel gerado no servidor, com exportação em segundo plano para volumes grandes; importador do histórico Lyrical.
- Viaturas: frota com alertas de seguro, inspeção e manutenção, indisponibilidades e viatura por equipa aplicada ao planeamento.
- Regra de proteção do `main` pronta a aplicar (`.github/protecao-main.json`).

### Alterado
- O protótipo local (dados no navegador, fotos de demonstração, Excel no cliente) foi retirado; a aplicação usa só a API.
- Planeamento e folhas de horas até 4–5× mais rápidos com centenas de trabalhadores; respostas comprimidas.
- Acessibilidade: nomes acessíveis, links, contraste e navegação por teclado corrigidos em vários ecrãs.
- Métricas e endpoints de gestão deixam de estar acessíveis na porta pública.
- O modo demonstração (guião, palco, menu Demonstração, troca livre de papel) deixa de fazer parte da aplicação; o protótipo só arranca com `npm run dev:prototipo` e nos testes E2E antigos.

## [3.1.0] — 2026-10-19

Funcionalidades do Lyrical Design e fotos (spec `docs/superpowers/specs/2026-10-16-andaime-lyrical-fotos-design.md`).

### Acrescentado
- Fotos em toda a app:
  - retratos de trabalhadores e gestores, com o ponto "em obra hoje";
  - obras em cartões com capa;
  - viaturas com placa e selo;
  - catálogo de EPI;
  - miniaturas no mapa.
- Carregar e remover fotos (reduzidas no navegador e guardadas no IndexedDB). "Repor demonstração" apaga-as.
- Fluxo 15 (fotos) com testes de store e E2E.
- **Diário de obra** (bloco 2):
  - separador na ficha da obra com linha do tempo por dia, atalhos por mês e pesquisa sem acentos;
  - registos com até 20 fotos, galeria acessível, editar e apagar com anular;
  - encarregado com câmara no telemóvel; o gestor é notificado;
  - exportação Word (A4, fotos de 7 cm sem deformar) e Excel;
  - dashboard com os últimos registos;
  - fluxo 11 com testes de store, do Word e E2E.
- **Dormidas e hotéis** (bloco 3):
  - página Dormidas por semana: quem dorme fora a partir da escala (sem dias de ausência), datas propostas, noites e resumo;
  - sugestão "longe de casa" (outro país ou mais de 100 km da residência);
  - estadias sem escala; exportação Excel;
  - separador Alojamento na obra (hotéis com foto, morada, contacto e uso) e na ficha do trabalhador;
  - "Onde durmo esta semana" na app do trabalhador, com notificação; painel no dashboard;
  - fluxo 10 com testes de domínio, store e E2E.
- **Ausências, mapa de férias e agenda** (bloco 4):
  - tipos de ausência Licença e Outra, com nota de ajuda por tipo;
  - separador Mapa do ano nas ausências: uma linha por pessoa, períodos aprovados (cheios) e pedidos (tracejados), dias úteis por ano;
  - página Agenda: grelha do mês com camadas (ausências, datas das obras, validades, eventos, Google), eventos próprios, lista por dia no telemóvel;
  - Google Calendar simulado: ligar, desligar e sincronizar férias sem duplicar;
  - obra com fim contratual e previsão de fim, com aviso de atraso na ficha e nos cartões;
  - fluxo 12 com testes de domínio, store e E2E.
- **Horas: totais, grelha e livro do RH** (bloco 5):
  - vista Totais por semana, mês e ano: horas por colaborador (fim de semana só se houver horas) e por obra;
  - grelha da semana (gestor e encarregado): horas por célula, extra calculado, motivo obrigatório guardado como correção, aprovados fechados;
  - livro de horas do RH mensal em Excel: uma folha por pessoa, fórmula de atividade, coluna Ausência com 0 h e o motivo;
  - OneDrive simulado: criar e atualizar o livro do mês sem duplicar;
  - "Como correu a semana" nos mapas semanais (por dia, obra e pessoa, com tabela);
  - donut por obra e filtro por obra nas horas da ficha do trabalhador;
  - fluxos 13 e 14 com testes de domínio, store, Excel lido de volta e E2E.
- **EPI e Definições** (bloco 6):
  - folha de entrega para assinar na ficha do trabalhador: o que tem em seu poder, declaração e linhas de assinatura; impressão em A4 vertical e Excel;
  - "Novo artigo no catálogo" ao registar uma entrega; se o nome já existir (sem acentos nem maiúsculas), usa o artigo que existe;
  - Definições → Integrações: Google Calendar e OneDrive (simulados) com estado, ligar/desligar e última sincronização;
  - Definições → Cópia da demonstração: exportar para JSON (com as fotos carregadas, opcional, com o tamanho estimado) e importar com validação da versão e confirmação;
  - página "Créditos das fotos" com autor, licença e ligação ao original de cada foto;
  - fluxos 16 e 17 com testes de domínio, store, Excel lido de volta e E2E.
- **Modo apresentação** (bloco 7): capítulos "10 · Dormidas da semana" (hotel marcado e "Onde durmo" no telemóvel do trabalhador) e "11 · Diário de obra com fotos" (palco dividido com o telemóvel do encarregado e a ficha da obra ao lado).
- Auditoria de acessibilidade (axe) e quality gate alargados às rotas novas: diário, alojamento, dormidas, agenda, mapa do ano, totais, grelha, livro do RH, definições e créditos.
- Repositório configurado para trabalho em equipa: CI, Dependabot, CODEOWNERS, modelos de issue e PR, licença e guia de contribuição.

### Alterado
- Lista de obras em cartões (a tabela continua disponível). No telemóvel, linha compacta com miniatura.

### Corrigido
- Guião: realçar um painel mais alto do que o ecrã deslocava a página inteira.
- Ficha da obra: os números da caixa Horas sobrepunham-se quando o palco dividido estreitava o conteúdo.
- CLS no planeamento: os filtros saltavam de linha com a troca de fonte.
- Scroll horizontal na ficha da viatura em ecrãs estreitos.
- Horas sobrepostas na tira da semana da ficha do trabalhador (360–390 px).
- O seed partilhava objetos de gestores entre stores.
- E2E: porta própria, relógio fixo e sem reutilizar servidores de outros projetos.

## [3.0.0] — 2026-10-16

Primeira versão completa do protótipo demonstrativo.

### Acrescentado
- 13 módulos: dashboard, planeamento, equipas, trabalhadores, obras, viaturas, horas e aprovações, mapas semanais com Excel, documentos, fardamento e EPI, ausências, mapa geográfico e relatórios.
- 3 experiências: gestor, encarregado e trabalhador (app móvel com offline simulado).
- 9 fluxos com efeitos entre módulos e modo apresentação com guião, realce e palco dividido.
- Design system próprio, testes Vitest e Playwright (com axe), relatório de revisão e lista de limitações.
