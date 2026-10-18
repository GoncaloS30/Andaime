# Registo de alterações

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/); versões em [SemVer](https://semver.org/lang/pt-BR/).

## [Por publicar] — V3.1

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
- Repositório configurado para trabalho em equipa: CI, Dependabot, CODEOWNERS, modelos de issue e PR, licença e guia de contribuição.

### Alterado
- Lista de obras em cartões (a tabela continua disponível). No telemóvel, linha compacta com miniatura.

### Corrigido
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
