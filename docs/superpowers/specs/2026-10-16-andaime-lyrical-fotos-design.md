# Andaime V3.1 — Funcionalidades do Lyrical Design e fotos

> Extensão do protótipo demonstrativo (dados fictícios, sem backend). Aprovada por secções em 16/10/2026.
> Spec anterior: `2026-10-15-andaime-v3-design.md` — tudo o que lá está mantém-se salvo indicação em contrário.

## 1. Contexto e objetivo

O utilizador entregou a versão mais recente do Lyrical Design (`Lyrical Design Windows.zip`, app Express + EJS + SQLite). Pediu:

1. Analisar todas as funcionalidades e acrescentar ao Andaime as que ele não tem.
2. Acrescentar **fotos** a trabalhadores, obras e a tudo o que torne a app mais intuitiva, **enquadradas no design atual** (não basta pôr a imagem).

Decisão do utilizador sobre a origem das fotos: **fotos reais de bancos com licença livre (Unsplash/Pexels) incluídas na demo, mais carregamento de fotos pelo utilizador.** A descarga precisa de autorização explícita, pedida com a lista de ficheiros.

O zip não contém bases de dados nem dados pessoais. Nada do Lyrical é copiado como dados.

## 2. Inventário: o que o Lyrical tem e o Andaime não

| # | Funcionalidade (ficheiros no Lyrical) | No Andaime antes desta spec |
|---|---|---|
| 1 | Dormidas e hotéis (`db/models/dormidas.js`, `hoteis.js`, `routes/dormidas.js`) | Não existe |
| 2 | Diário de obra com fotos, linha do tempo, pesquisa sem acentos, exportação Word/Excel (`diarioObra.js`, `exportarWord.js`, `medidasDeImagem.js`, `public/fotos-report.js`) | Não existe |
| 3 | Eventos: calendário mensal com férias, datas das obras e Google Calendar; sincronizar férias (`agenda.js`, `googleCalendar.js`, `calendarioMes.js`) | Não existe |
| 4 | Mapa de férias anual por pessoa, com dias úteis (`ferias.js`, `mapaFerias.js`) | Só o calendário mensal de ausências |
| 5 | Livro de horas do RH mensal, com coluna Ausência e sincronização OneDrive (`horasRh.js`, `sincronizarRh.js`, `microsoftGraph.js`) | Só a exportação ERP semanal, sem ausências |
| 6 | Horas por semana, mês e ano (`periodos.js`, `relatorios.js`) | Há relatórios, mas sem grelhas navegáveis |
| 7 | Lançar horas extra em grelha (`routes/mapas.js`) | Só registo a registo |
| 8 | "Como correu a semana": gráficos por dia, obra e pessoa (`graficoSemana.js`) | Não existe |
| 9 | Folha de entrega de ferramentas para assinar (`ferramentas.js`, `/ferramentas.xlsx`) | Há entregas, mas não a folha |
| 10 | Tipos de ausência Licença e Outra (`ausencias.js`) | Faltam |
| 11 | Donut por obra e registos filtrados por obra na ficha (`donut.js`) | Parcial |
| 12 | Previsão de fim separada do fim da obra (`projetos.data_previsao_fim`) | Só "Fim previsto" |
| 13 | Cópias de segurança ao arrancar (`backup.js`) | Substituídas por exportar/importar cópia em JSON |

**Fica de fora, de propósito:**
- A "Equipa de Gestão" como linha sem equipa: o Andaime já modela o encarregado e o diretor de obra.
- As ligações reais ao Google e à Microsoft: ficam **simuladas** e assinaladas como tal.

## 3. Sistema de fotos

### 3.1 Onde aparecem

| Entidade | Formato | Onde |
|---|---|---|
| Trabalhador | Retrato quadrado, cantos 8 px (círculo de 28 px em listas densas) | Listas, quadro de planeamento, bandeja, fichas, app do trabalhador, encarregado, paleta de comandos |
| Obra | Capa 16:9 | Lista de obras (passa a cartões), topo da ficha, pinos e painel do mapa |
| Viatura | 4:3 | Frota, ficha, diálogo de atribuição |
| Hotel | 4:3 em miniatura | Separador Alojamento e página Dormidas |
| Diário de obra | Miniaturas 4:3 e galeria | Ficha da obra, encarregado, dashboard |
| Artigo de EPI/ferramenta | 1:1 | Catálogo, entregas, folha de entrega |
| Equipa | Retratos dos membros sobrepostos (até 4 + "+N") | Listas e fichas de equipa |

Os documentos continuam sem foto.

### 3.2 Enquadramento visual
- **Tratamento de cor igual em todas as fotos** (classe `.photo-grade`): `saturate(.88) contrast(1.04)` e um véu Pinho a 6 % por `mix-blend-mode: multiply`. Fotos de origens diferentes parecem da mesma família.
- **Sobreposições na linguagem atual:**
  - código da obra num chip Pinho com texto Lima e o país;
  - matrícula como placa (fundo branco, contorno escuro, faixa Aço à esquerda);
  - estado da viatura como selo no canto;
  - ponto Lima no retrato de quem está em obra hoje;
  - o medidor de horas continua por baixo da capa da obra.
- **Tamanho reservado:** proporção fixa com `aspect-ratio` e fundo `line-2` enquanto carrega, sem salto de layout.
- **Alternativas:** se não houver foto ou ela falhar, aparecem as iniciais com `avatarBackground` (pessoas) ou um ícone sobre fundo `line-2` (resto).
- **Movimento reduzido:** o fade-in de 180 ms desaparece com `prefers-reduced-motion`.

### 3.3 Origem e armazenamento
- **Fotos de banco:**
  - cerca de 70 ficheiros, licença livre;
  - dois tamanhos WebP: miniatura (~200 px) e média (~1280 px nas capas, ~800 px no resto);
  - pasta `public/fotos/{trabalhadores,obras,viaturas,hoteis,diario,epi}`;
  - créditos em `public/fotos/CREDITOS.md` e numa página "Créditos das fotos" nas Definições;
  - antes de integrar, o utilizador vê uma folha de contacto com todas as fotos.
- **Critérios de escolha:**
  - luz natural e enquadramento consistente;
  - EPI visível nos trabalhadores;
  - sem marcas comerciais legíveis nem contextos sensíveis.
- **Fotos carregadas:**
  - origem: input de ficheiro ou câmara do telemóvel (`capture="environment"` no diário);
  - reduzidas no navegador (canvas, JPEG, lado maior 1600 px, ~300 KB);
  - recorte automático ao formato só na apresentação (`object-fit: cover`), sem alterar o ficheiro;
  - guardadas no IndexedDB (`andaime-fotos`), porque o `localStorage` só leva ~5 MB;
  - sem IndexedDB (janela privada), ficam só em memória durante a sessão, com aviso;
  - "Repor demonstração" limpa o IndexedDB.
- **Desempenho:** `loading="lazy"`, `decoding="async"` e `srcset`/`sizes`. As fotos nunca entram no bundle.
- **Acessibilidade:**
  - o `alt` descreve o conteúdo ("Retrato de …", "Capa da obra …", "Foto 2 de 4 do diário de 15/10");
  - as miniaturas são botões;
  - a galeria é um diálogo com setas, Esc e devolução do foco.

## 4. Funcionalidades

### 4.1 Dormidas e hotéis (navegação: *Planeamento → Dormidas*, a seguir a Viaturas)
- **Ficha da obra, separador "Alojamento":**
  - hotéis da obra, cada um com nome (único na obra), foto, morada, contacto e notas;
  - criar, editar e remover;
  - uso de cada hotel: noites levadas e a última estadia;
  - remover um hotel não apaga as estadias: ficam com "hotel por definir".
- **Página Dormidas (por semana):**
  - quadro com uma linha por pessoa e obra escalada nessa semana, com os dias em que lá está mesmo (dias de ausência aprovada não contam);
  - as datas propostas são: entrada na noite do primeiro dia, saída na manhã do último; com um só dia, propõe 1 noite;
  - as noites contam-se da entrada à saída (entrar segunda e sair sexta são 4 noites);
  - marcar = escolher hotel (ou "por definir") e acertar as datas; também se pode alterar e remover;
  - **sugestão "longe de casa"** quando a obra fica a mais de 100 km da cidade de residência ou noutro país; é só uma sugestão e quem marca decide;
    - a residência é a `homeCity` do trabalhador, com coordenadas tiradas de uma tabela de cidades em `src/data/seed/cities.ts`;
    - se a cidade não estiver na tabela, não há sugestão e a linha mostra só "residência sem localização";
  - resumo no topo: pessoas fora, noites, por definir e estadias sem escala;
  - secção **"Estadias sem escala"**: estadias cuja linha da escala desapareceu ou mudou de obra; não se apagam sozinhas;
  - exportação para Excel da semana.
- **Efeitos noutros módulos:**
  - ficha do trabalhador: histórico de estadias;
  - app do trabalhador: cartão "Onde durmo esta semana" (hotel, morada, noites, datas);
  - dashboard: noites da semana e estadias por definir;
  - histórico e notificação ao trabalhador quando lhe é marcada uma estadia.

### 4.2 Diário de obra (separador na ficha da obra; entrada "Diário" no menu do encarregado)
- **Registo:**
  - data, título, texto (com mudanças de linha), autor (persona e papel), criado em, até 20 fotos;
  - pode haver mais de um registo no mesmo dia.
- **Linha do tempo:**
  - do mais recente para o mais antigo, com atalhos por mês e a contagem de cada um;
  - pesquisa sem acentos nem maiúsculas no título e no texto.
- **Edição:**
  - editar, apagar o registo e remover fotos;
  - o gestor e o encarregado da obra podem editar.
- **Encarregado no telemóvel:** formulário de um ecrã, com câmara direta e pré-visualização das fotos antes de guardar.
- **Exportação:**
  - **Word (.docx)** em A4: margens de 2 cm, letra pequena, fotos de 7 cm lado a lado sem deformar e uma linha entre dias;
  - gerado com `jszip`, carregado só ao exportar;
  - **Excel** com uma linha por registo;
  - as duas exportações respeitam o filtro de mês e a pesquisa ativos.
- **Dashboard:** "Últimos registos do diário", com miniaturas.

### 4.3 Agenda (navegação: *Planeamento → Agenda*)
- Grelha do mês de segunda a domingo, com os dias dos meses vizinhos esbatidos, e navegação entre meses.
- **Camadas que se ligam e desligam:**
  - ausências aprovadas, com férias destacadas;
  - início, fim contratual e previsão de fim de cada obra;
  - validades de documentos, seguros e inspeções nos próximos 60 dias;
  - eventos próprios;
  - Google (simulado).
- Os eventos de dia inteiro aparecem primeiro e os de vários dias atravessam as células. Os eventos internos abrem a entidade a que se referem.
- **Novo evento:** título, data ou intervalo, hora opcional e local.
- **Google Calendar simulado:**
  - "Ligar conta" mostra eventos de exemplo da camada Google;
  - "Sincronizar férias" pode repetir-se sem duplicar nada (guarda as chaves sincronizadas);
  - um toast mostra quantos eventos foram criados e quantos já existiam;
  - selo "Simulado" visível.
- Em telemóvel, a grelha passa a lista por dia.

### 4.4 Ausências
- Tipos novos **Licença** e **Outra ausência**, com nota explicativa no formulário como no Lyrical.
- **Separador "Mapa do ano":**
  - uma linha por pessoa, com os 12 meses em colunas finas e os períodos desenhados;
  - quem não tem férias marcadas fica com a linha vazia;
  - dias úteis de férias contados só dentro do ano;
  - seletor de ano: anos com férias, o ano corrente e o seguinte;
  - linha de hoje;
  - legenda por tipo, sem depender só da cor (padrões e etiqueta).
- **Teclado:** a grelha percorre-se por linha, e cada período é um botão que abre o detalhe.

### 4.5 Horas
- **Separador "Totais":**
  - vista semana (dias, com o fim de semana só se lá houver horas), mês (semanas) ou ano (meses), com navegação anterior/seguinte;
  - grelha colaborador × período e grelha obra × colaborador;
  - ordenar por total ou por código;
  - filtros de obra e de trabalhador;
  - os números batem com os selectors existentes.
- **Grelha da semana** (gestor e encarregado no seu âmbito):
  - uma célula por pessoa e dia, com as horas totais;
  - mudar uma célula cria ou ajusta o registo do dia, com as horas extra calculadas pelas regras atuais;
  - exige motivo e fica como correção no histórico;
  - registos já aprovados ficam só de leitura.
- **Livro de horas do RH (mensal):**
  - uma folha por pessoa, chamada "Nome-Número" (no máximo 31 caracteres e sem `: \ / ? * [ ]`);
  - colunas como no Lyrical: data, horas, obra/elemento, Atividade e Ordem como fórmulas para uma folha "Tabelas", e por fim a coluna **Ausência**;
  - os dias de ausência entram com 0 h e o motivo;
  - os dias sem nada não entram.
- **OneDrive simulado:**
  - "Criar o livro do mês" e "Atualizar o livro";
  - atualizar substitui só o período sincronizado, por isso repetir dá o mesmo resultado;
  - mostra a data da última atualização;
  - selo "Simulado".

### 4.6 Mapas semanais — "Como correu a semana"
- Colunas com as horas de cada dia (realizadas sólidas e planeadas tracejadas) e barras de horas por obra (com o limite como linha) e por pessoa.
- Segue a skill `dataviz` e a paleta validada, com tabela alternativa.

### 4.7 Fardamento e EPI
- **Folha de entrega para assinar** (Excel e impressão A4):
  - dados da pessoa e o que está entregue, com o artigo, o tamanho e a data de cada entrega;
  - linhas de assinatura e data.
- Acrescentar artigos ao catálogo a partir da ficha do trabalhador. Se o nome já existir (comparado sem acentos nem maiúsculas), usa o artigo que existe.
- Foto em cada artigo.

### 4.8 Obras
- Os campos passam a ser **Fim contratual** (novo) e **Previsão de fim** (o atual `endDate`).
- Quando a previsão passa o fim contratual, aparece um aviso na ficha, na lista e no dashboard.
- As duas datas aparecem na Agenda.

### 4.9 Ficha do trabalhador
- No separador Horas:
  - **donut** com a parte de cada obra nas horas, com legenda e tabela;
  - filtro dos registos por obra.
- No separador Alojamento: o histórico de estadias.

### 4.10 Definições
- **Integrações (simulado):** cartões do Google Calendar e do OneDrive, com o estado, ligar/desligar e a última sincronização.
- **Cópia da demonstração:**
  - exportar o estado para JSON, com uma opção para incluir as fotos carregadas (avisa sobre o tamanho);
  - importar uma cópia, com validação da versão e confirmação antes de substituir.
- **Créditos das fotos.**

### 4.11 Modo apresentação
- Capítulos novos:
  - "Dormidas da semana" (fluxo 10);
  - "Diário de obra com fotos" (fluxo 11, no palco dividido: o encarregado no telemóvel e o gestor na ficha da obra).
- Os jumps são idempotentes, como os atuais.

## 5. Modelo de dados

```ts
type PhotoRef =
  | { kind: 'banco'; src: string; credit: string; alt: string; w: number; h: number }
  | { kind: 'carregada'; id: string; alt: string; w: number; h: number }

Worker        { …, photo?: PhotoRef }
Site          { …, photo?: PhotoRef, contractEnd: ISODate }   // endDate = previsão de fim
Vehicle       { …, photo?: PhotoRef }
EquipmentItem { …, photo?: PhotoRef }
AbsenceType   … | 'licenca' | 'outra'

Hotel         { id, siteId, name, address, contact, notes, photo?, createdAt }
Stay          { id, workerId, siteId, hotelId: ID | null, week: ISODate, checkIn: ISODate, checkOut: ISODate, notes, createdAt }
DiaryEntry    { id, siteId, date, title, text, authorId, authorRole, createdAt, updatedAt, photos: PhotoRef[] }
CalendarEvent { id, title, date, endDate, time: HHMM | null, location, source: 'andaime' | 'google' }

DB            + hotels, stays, diary, events: Record<ID, …>, integrations: Integrations
Integrations  { google: { connected, lastSync, syncedKeys: string[] },
                onedrive: { connected, books: Record<string /* AAAA-MM */, ISODateTime> } }
```

- `Stay` é único por `(workerId, week, siteId)`. A ação recusa duplicados.
- O `STORE_VERSION` passa para **4**: um estado guardado numa versão anterior volta aos dados de demonstração.
- **Semente:**
  - fotos para todos os trabalhadores, obras, viaturas e artigos;
  - hotéis nas obras longe da sede (FR, BE, DE e Loulé);
  - estadias da semana atual, com 1 por definir e 1 sem escala;
  - diário das últimas 3 semanas, com fotos, nas obras em curso;
  - alguns eventos;
  - Google e OneDrive desligados.

## 6. Arquitetura

- **Regras puras em `src/domain`, com testes escritos primeiro:**
  - `stays.ts`: noites, datas propostas, quadro da semana, órfãs, resumo e distância (haversine);
  - `diary.ts`: normalização da pesquisa, meses e limites;
  - `agenda.ts`: grelha e camadas;
  - `vacationMap.ts`;
  - `periods.ts`;
  - `hrBook.ts`;
  - `weekCharts.ts`.
- **Mutadores** em `src/store/mutations.ts` e **ações** em `src/store/actions/{lodging,diary,calendar,integrations}.ts`. Cada ação regista histórico e notificações e empilha "Anular" quando é reversível.
- **Selectors memoizados** em `selectors.ts`: quadro de dormidas, diário filtrado, grelha da agenda e totais por período.
- **`src/lib/photos`:**
  - `<Photo>`, `PhotoStack`, `PhotoUpload`, `Gallery`;
  - `resize.ts` (canvas);
  - `photoStore.ts` (IndexedDB, com alternativa em memória);
  - `usePhoto`, que gere a vida dos object URLs.
- **`src/lib/docx/diaryDocx.ts`:** Word com `jszip` (dependência nova, import dinâmico) e as medidas das imagens tiradas do cabeçalho PNG/JPEG.
- **`src/lib/excel`:** `hrBook.ts`, `stays.ts` e `deliverySheet.ts`, todos com import dinâmico do `exceljs`.
- **Módulos lazy:** cada página nova é uma rota `lazy`, como as atuais. A Agenda, as Dormidas e a galeria não entram no arranque.

## 7. Ordem de construção

Cada bloco fecha com testes verdes, uma crítica visual e um commit.

| Bloco | Conteúdo | Ponto de controlo com o utilizador |
|---|---|---|
| 1 | Base das fotos e fotos de banco (descarga com autorização e folha de contacto), retratos em toda a app, obras em cartões, viaturas, pinos do mapa, EPI, equipas | Sim: capturas |
| 2 | Diário de obra (ficha, encarregado, galeria, Word, Excel, dashboard) | — |
| 3 | Dormidas e hotéis (Alojamento, página, app do trabalhador, avisos, dashboard) | Sim: capturas |
| 4 | Ausências (tipos, mapa do ano), Agenda com Google simulado, fim contratual e previsão | — |
| 5 | Horas (Totais, grelha da semana, livro do RH com OneDrive simulado), gráficos da semana, donut | Sim: capturas |
| 6 | Folha de entrega de EPI, Definições (integrações, cópia, créditos) | — |
| 7 | Capítulos do guião, E2E, axe, Lighthouse, README, limitações, relatório de revisão | Entrega |

## 8. Testes e aceitação

**Fluxos novos.** Cada um tem um teste de store e um teste E2E.

| # | Fluxo | Onde a mudança tem de aparecer |
|---|---|---|
| 10 | O gestor marca o hotel de quem está escalado em Munique | Dormidas (noites e resumo), ficha do trabalhador, app do trabalhador, dashboard. Se a escala mudar, a estadia passa a "sem escala" |
| 11 | O encarregado escreve um registo no diário com 2 fotos | Linha do tempo, pesquisa, dashboard e Word lido de volta (título, texto e 2 imagens) |
| 12 | São aprovadas férias | Mapa do ano (dias úteis), Agenda e livro do RH (0 h com "Férias") |
| 13 | É atualizado o livro do RH do mês | O .xlsx lido de volta: uma folha por pessoa, fórmulas e coluna Ausência. Sincronizar duas vezes dá o mesmo resultado |
| 14 | O encarregado põe 10 h numa célula da grelha | Horas extra calculadas, correção com motivo e Realizadas da obra |
| 15 | É carregada uma foto de um trabalhador | Planeamento, ficha e app. Mantém-se depois de recarregar e desaparece com "Repor demonstração" |

**Critérios de aceitação:**
- TypeScript, lint, Vitest, build, Playwright (Edge: desktop, tablet e telemóvel) e `npm audit` sem falhas.
- axe sem violações sérias nem críticas nas rotas novas, incluindo galeria, mapa do ano e agenda.
- Teclado:
  - galeria com setas, Esc e devolução do foco;
  - grelhas percorríveis;
  - upload sem precisar de arrastar.
- Fotos sem salto de layout (CLS ≤ 0,02 nas páginas com fotos).
- O bundle inicial cresce no máximo 15 KB gzip.
- Lighthouse: desktop ≥ 95 e telemóvel sem piorar face aos valores atuais (painel 83, planeamento 66–78).
- Capturas a 1440, 1024, 768, 390 e 360 px dos ecrãs novos, com crítica visual (`design-critique`).
- Os capítulos novos do guião correm a partir de qualquer estado, incluindo depois de "Repor demonstração".

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Fotos de banco com estilos diferentes | Critérios de escolha fixos, tratamento de cor da marca e folha de contacto aprovada antes de integrar |
| Caras reais em trabalhadores fictícios | Só licenças que permitem este uso, sem contextos sensíveis, créditos registados e "dados fictícios" sempre visível |
| Peso das fotos (~8 MB) | Fora do bundle, carregamento lazy, WebP em dois tamanhos |
| IndexedDB indisponível | Fotos só em memória durante a sessão, com aviso |
| Word gerado no navegador | Método do Lyrical (jszip e XML), com um teste que lê o .docx de volta |
| Integrações simuladas tomadas como reais | Selo "Simulado" e explicação; nunca pede credenciais |
| Âmbito grande | 7 blocos entregáveis, com pontos de controlo nos blocos 1, 3 e 5 |

## 10. Fora de âmbito
- Ligações reais ao Google e à Microsoft.
- Reconhecimento de pessoas nas fotos.
- Edição de imagem além de reduzir e recortar na apresentação.
- Fotos em documentos.
- Equipa de Gestão como linha sem equipa.
- Cópias automáticas ao arrancar.
