# Andaime V3: plano mestre do protótipo interativo

> Protótipo de alta fidelidade e **demonstrativo**: tudo corre no browser, com dados fictícios e sem backend.
> Pasta do projeto: `C:\Users\sangon\Desktop\obras` (está vazia e ainda não é repositório git).

---

## 1. Contexto

Quero construir uma demonstração navegável de um SaaS de gestão operacional para construtoras. O ciclo do produto é **Planeamento → Execução → Controlo → Análise**. A demonstração junta quatro coisas:

- a profundidade funcional do **Lyrical Design**;
- a visão do **Andaime anterior**;
- a interatividade e o modo de apresentação do **Mesa**;
- uma identidade visual própria e premium.

O objetivo é mostrar o produto a empresários reais. Cada ação deve ter consequências visíveis nos outros módulos.

### Decisões já tomadas com o utilizador
- **Empresa fictícia:** construção civil genérica, com obras em Portugal, França, Bélgica e Alemanha.
- **Entrega:** corre em local (`npm run dev`) e gera um build estático pronto a publicar (Vercel ou Netlify). **Não publico nada sem confirmação.**
- **Idioma:** apenas pt-PT. Os textos ficam centralizados num só sítio para facilitar traduções futuras.

---

## 2. Inventário das referências (Fase 0, feita)

### 2.1 Lyrical Design (`C:\Users\sangon\Desktop\pai\app`)

É uma app local em Express, EJS e SQLite que substituiu dois livros Excel e uma macro VBA de uma empresa de montagens.

| Funcionalidade encontrada | Regra ou ficheiro | Melhoria no Andaime V3 |
|---|---|---|
| Escala semanal em "linhas de equipa" (equipa, obra, viatura, descrição, observações, dias, trabalhadores) | `db/schema.sql:39-54`, `routes/escala.js` | Modelo de **atribuição diária por trabalhador** (obra e horas), com várias obras por dia. As linhas passam a ser editáveis, com arrastar e largar e ações em lote |
| Semana identificada pela segunda-feira e numerada pelo ISO 8601. Só segunda a sexta | `lib/dates.js:6-56` | Semana de 7 dias. O fim de semana aparece compacto e conta como horas extra |
| `dias` como texto compacto (`"45"`). Sem dias escolhidos aplica a semana inteira | `lib/dias.js:19-27` | Seleção de dias por chips, mais o redimensionamento de blocos no quadro |
| Conflito: a mesma pessoa duas vezes no mesmo dia. Bloqueia ao guardar e avisa ao ver | `db/models/escalas.js:72-121` | Catálogo de **9 tipos de conflito**, cada um com explicação e **ações corretivas que se executam diretamente** |
| Gerar horas a partir da escala (8h por dia, uma linha de cada vez, manual) | `db/models/horas.js:5-34` | Ciclo de ponto → submissão → revisão → aprovação. O planeado nunca se converte silenciosamente em realizado |
| Horas extra como diferença com sinal por dia, na grelha do mapa | `routes/mapas.js:122-174` | As horas extra são **calculadas** a partir da entrada, saída e pausas. As correções exigem motivo e ficam no histórico |
| Limite de horas por obra: `registadas` vs. `planeadas` vs. `restantes`, confirmação antes de ultrapassar | `db/models/consumo.js` | Definições sem ambiguidade (secção 6). Medidor com tracejado para o planeado e preenchimento sólido para o realizado. Alertas a 85% e a 100% |
| Terminologia inconsistente: Projeto/Obra, Colaborador/Trabalhador, "Horas planeadas" usado para o limite | `views/projetos.ejs:29` | Glossário fixo: Obra, Trabalhador, Limite de horas, Planeadas, Realizadas, Aprovadas, Saldo |
| Mapa semanal e exportação Excel "Mapa por equipa" (blocos de equipa, dias, trabalho, viatura, observações) e "Horas" (uma folha por trabalhador, Atividade 800/801/802, Ordem) | `lib/exportarExcel.js` | Templates: Mapa por equipa, Mapa por obra, Folha de horas e Exportação ERP (códigos de atividade configuráveis). Tema claro e imprimível. Notas gerais da semana |
| Viaturas: matrícula, seguro e inspeção guardados sem qualquer alerta | `schema.sql:25-30` | Marca, modelo, lotação, estado, manutenção, alertas de validade, conflitos de dupla reserva e de lotação |
| Fardamento: T-shirt, sweat, calças, botas, parka (texto livre) | `db/models/trabalhadores.js:2-16` | Tamanhos validados, catálogo de EPI e equipamento, entregas, devoluções e estados |
| Mapa Leaflet com pino arrastável e leitura de links do Google Maps | `lib/localizacao.js`, `public/mapa.js` | Mapa com filtros por país, estado e risco de horas, e painel lateral |
| Excel real: 3 períodos de férias por ano, residência, manutenção, ferramentas por trabalhador, "Notas gerais da semana" | `Mapa de trabalhos -Semana 34.xlsm` | Ausências com pedido e aprovação, cidade de residência, equipamentos, notas semanais |
| Falta: ausências, aprovações, papéis, histórico, clientes, país, encarregado por obra, composição das equipas | n/a | Tudo isto entra no modelo de dados |

### 2.2 Mesa (`C:\Users\sangon\Desktop\restproj\reference\prototype-v0`)

É HTML e JS sem framework. Os padrões a **reproduzir em React** são:

- Uma **store única** com ações de domínio com nome e notificações agrupadas (`js/store.js:66-86`).
- Toasts e um feed de atividade marcados com a superfície de origem.
- `flags` de simulação de estados (falha, offline).
- **"Jumps" idempotentes que preparam os próprios pré-requisitos** (`client.js:605-624`). É isto que deixa o guião e a exploração livre coexistir.
- Um registo `GUIDE` de passos por vista (`shell.js:70-80`).
- Um palco com vários dispositivos sobre o mesmo estado vivo (`shell.js:8-43`).
- Uma galeria de estados.

A corrigir face ao Mesa:

- Não tem persistência nem foco preso em modais, e não reage ao Escape.
- Tem elementos clicáveis que não são botões e linhas de tabela inacessíveis por teclado.
- Não tem testes.

### 2.3 Andaime anterior

Existe apenas como **plano v3**, guardado num transcript do projeto `restproj` (`…\9f5d0239…\tool-results\toolu_014ptWCvcchphEbhCSiUCySr.txt`). O código foi apagado a pedido do utilizador.

**A preservar:**
- os quatro papéis (admin, gestor, encarregado, trabalhador);
- atribuições com histórico e conflitos de disponibilidade;
- obras com país e fuso horário;
- folhas de horas com submissão, revisão e aprovação, e emendas rastreáveis;
- documentos com requisitos por país (por exemplo o A1);
- uma estratégia offline com caixa de saída;
- o princípio de não se apresentar como substituto de salários, contabilidade ou aconselhamento jurídico.

**A redesenhar:**
- a identidade visual, que era a do Mesa (Newsreader e terracota);
- a stack de produção (Spring Boot, RLS), que fica para depois. A arquitetura de pastas deve facilitar essa migração.

---

## 3. Direção visual (`frontend-design`)

**Tema:** um centro de operações de obra. O mundo de referência é a régua e a fita métrica, o pinho do cofragem, a cal e o betão.

| Token | Hex | Uso |
|---|---|---|
| Pinho | `#13342A` | Barra lateral, texto estrutural, preenchimento "realizado" |
| Musgo | `#24543F` | Hover e ativo sobre Pinho, preenchimento "aprovado" |
| Cal | `#F5F5F0` | Fundo da app. Superfícies em `#FFFFFF` |
| Betão (escala) | `#1F2421` / `#5C635E` / `#9AA09B` / `#DADCD5` / `#ECEDE8` | Texto principal e secundário, desativado, contornos, fundos subtis |
| Lima | `#C8E26A` | Acento: indicador de "hoje", seleção, foco sobre fundo escuro. **Nunca usado como texto sobre branco** |
| Âmbar | `#C98A12` (texto `#8A5D06`) | Avisos e risco de limite |
| Tijolo | `#B03A2E` | Erros, ações destrutivas, limite excedido |
| Aço | `#3B6A8C` | Informação, estado "em revisão" |

**Tipografia:**
- **Archivo**, variável com eixo de largura. É a única família de texto e muda de personalidade pela largura:
  - *Expanded* (wdth 112–125, semibold) em títulos e números de KPI;
  - *Normal* no corpo;
  - *Condensed* (wdth 75–85) nas grelhas densas do planeamento e nos cabeçalhos de tabela.
- **JetBrains Mono** para códigos de obra, matrículas e horas, sempre com números tabulares.
- As fontes são servidas localmente com `@fontsource`. Não há Google Fonts em runtime.

**Escalas:**
- Tipografia: 12 / 13 / 14 / 16 / 20 / 24 / 32 / 44.
- Espaçamento: grelha de 4 pt (4, 8, 12, 16, 20, 24, 32, 48).
- Raios: 4 (chips), 8 (campos e cartões), 12 (drawers e modais).
- Elevação: e0 sem sombra, só contorno; e1 para popovers; e2 para drawers e modais. Na densidade normal **evito sombras**: a hierarquia faz-se com fundos (Cal vs. branco) e réguas finas.

**Assinatura: a régua de capacidade e a linguagem tracejado/sólido.**
- Cada célula dia × trabalhador tem 8 marcas de hora, como uma fita métrica.
- As atribuições enchem-na. **Tracejado diagonal = planeado; sólido = realizado; sólido mais escuro = aprovado.** Acima de 8h, o excesso fica âmbar; numa sobreposição impossível fica tijolo.
- A mesma linguagem aparece no medidor de horas da obra (limite como linha vertical, saldo à direita), na ficha do trabalhador e nos relatórios.
- Isto codifica de forma visível a distinção que o briefing pede ("não confundir planeadas com realizadas").

**Risco estético assumido:** os títulos em Archivo Expanded e as grelhas em Condensed dão um tom de sinalética de estaleiro sem cair em ilustrações temáticas.

Fica explicitamente **fora**: creme com serifa e terracota (era o Andaime antigo e o Mesa), fundo escuro com neon, e cartões KPI repetidos com gradiente.

**Layout (desktop):**
```
┌──────┬───────────────────────────────────────────────────────────┐
│ Pinho│ Semana 42 ◂ ▸  · Pesquisa (Ctrl K) · Papel ▾ · ⚑ Demonstração │
│ rail │───────────────────────────────────────────────┬───────────│
│ Plan.│  Conteúdo do módulo (densidade compacta)       │ Drawer de │
│ Exec.│                                                │ detalhe / │
│ Ctrl.│                                                │ Guião     │
│ Anál.│                                                │           │
└──────┴────────────────────────────────────────────────┴───────────┘
```
- A barra lateral agrupa os módulos pelos 4 pilares.
- Abaixo de 1024px recolhe para ícones.
- Abaixo de 768px passa a uma barra inferior com 5 entradas e um menu "Mais".

**Motion (`motion-design-web`):** uma curva `cubic-bezier(.2,.7,.2,1)` e durações de 120, 180 e 260 ms.
- Drawers deslizam 12px e aparecem com fade.
- No arrastar e largar há um fantasma inclinado 1,5° e a célula de destino fica em Lima.
- Um conflito novo faz um pulso único.
- Os números dos KPI fazem uma contagem curta quando mudam.
- Com `prefers-reduced-motion`, tudo passa a fades de 1ms e não há contagens.

---

## 4. Arquitetura (`architecture`, `system-design`)

**Stack:** Vite e React 19, TypeScript strict, Tailwind CSS v4 (tokens via `@theme`), React Router 7 (browser router com fallback SPA), Zustand 5 com immer e persist, `@dnd-kit/core` (sensor de teclado acessível), primitivas Radix (Dialog, Popover, Tabs, Select, Tooltip, DropdownMenu), lucide-react, date-fns (locale `pt`), sonner (toasts), cmdk (paleta de comandos), Leaflet e react-leaflet, exceljs (carregado só quando é preciso).

**Testes:** Vitest e Testing Library para unidades e componentes; Playwright com `@axe-core/playwright` para E2E e acessibilidade.

Não uso Next.js: é uma SPA estática sem SSR e não traria vantagem concreta.

ADRs a escrever em `docs/adr/`:
- **0001** stack front-end;
- **0002** uma store local como fonte única de verdade, com selectors derivados;
- **0003** a atribuição diária por trabalhador como unidade do planeamento (substitui a "linha de equipa" do Lyrical e permite dias repartidos);
- **0004** simulação de papéis e de offline (sem garantias reais).

**Estrutura de pastas.** Os módulos são verticais para que a migração para API seja feita por módulo.
```
src/
  app/            router, AppShell, providers, RoleGate
  domain/         tipos + funções puras (sem React): weeks, hours, siteMetrics,
                  availability, conflicts, conflictFixes, documents, weeklyMap, ids
  data/seed/      gerador determinístico (PRNG com semente) relativo a "hoje"
  store/          store.ts, slices/<domínio>.ts (ações), selectors/<domínio>.ts,
                  persistence.ts (versão + migrate), activity.ts, undo.ts, demo.ts
  ui/             design system: Button, IconButton, Field, Select, Combobox, Badge,
                  StatusPill, Table, Tabs, Drawer, Dialog, Sheet, Toast, EmptyState,
                  Skeleton, ErrorState, Avatar, HoursGauge, CapacityRuler, Kpi, Calendar*
  features/       dashboard, planning, teams, workers, sites, vehicles, timesheets,
                  weekly-maps, documents, equipment, absences, geo-map, reports,
                  foreman, worker-app, presentation, settings
  lib/            format (pt-PT), excel/, print, cn
  copy/           textos pt-PT (glossário, mensagens)
e2e/              fluxos 1–9 + a11y
docs/             spec, ADRs, design-system.md, copy.md, review-report.md
```

**Estado:**
- `useDemoStore` guarda `db` normalizado (`Record<id, T>` por entidade) e `session`:
  - papel e persona ativos;
  - `online`, a caixa de saída (`outbox`) e os `flags` de simulação;
  - o estado do guião;
  - as preferências de persistência.
- **Todas as mutações** passam por ações com nome em `slices/`. Essas ações:
  1. validam com funções do `domain/`;
  2. alteram `db`;
  3. registam um `ActivityEvent` (histórico);
  4. geram notificações para os papéis afetados;
  5. empilham um "undo" (só no planeamento).
- Os ecrãs **nunca** guardam cópias derivadas. KPIs, conflitos e métricas de obra são selectors memoizados sobre `db`, com índices `assignmentsByWorkerDate` e `bySiteDate`.
- A persistência usa `localStorage` com `version`. Se a versão divergir, volta a semear. Há um interruptor "Guardar localmente" (desligado = memória) e um "Repor demonstração".

---

## 5. Modelo de dados (`domain/types.ts`)

- **Company** (fictícia: "Construções Ribeira Alta, S.A.", com o rótulo *Empresa fictícia*).
- **Client**: id, nome, NIF fictício, contacto.
- **Site (Obra)**:
  - id, código `OB-25-012`, nome, clientId, país (PT/FR/BE/DE), cidade, morada, lat/lng, fuso horário;
  - estado (planeada / em curso / suspensa / concluída), início, fim;
  - `hourLimit`, diretorId, encarregadoId, cor.
- **Worker**:
  - id, número mecanográfico, nome, categoria (Encarregado, Chefe de equipa, Pedreiro, Carpinteiro de cofragem, Armador de ferro, Eletricista, Canalizador, Manobrador, Serralheiro, Servente), telefone fictício, nacionalidade, cidade de residência, data de admissão, estado;
  - teamId, viaturaHabitualId, `dailyHours` (8);
  - tamanhos: T-shirt, sweat, parka (XS–3XL), calças (36–56), botas (36–48), luvas (7–11).
- **Team**: id, nome, cor, encarregadoId, memberIds, vehicleId, obraHabitualId, histórico.
- **Vehicle**: id, matrícula `AA-00-AA`, marca, modelo, lugares, estado (operacional / oficina / inativa), km, validades de seguro, inspeção e manutenção, teamId.
- **Assignment**: id, workerId, siteId, date, horas planeadas, horário (início e fim), teamId, vehicleId, `isForeman`, nota, batchId (identifica a escala que a criou).
- **VehicleBooking**: id, vehicleId, date, siteId, teamId, condutorId.
- **TimeEntry**:
  - id, workerId, siteId, date, entrada, saída, pausa em minutos, origem (ponto / manual / encarregado);
  - estado: `aberto → submetido → revisto → aprovado` | `rejeitado`;
  - correções `[{por, motivo, antes, depois, em}]`;
  - presença confirmada.
- **Absence**: id, workerId, tipo (férias, falta justificada, falta injustificada, baixa médica, formação, parcial), início, fim, horas (se parcial), estado (pedido / aprovado / rejeitado), motivo, decisor.
- **DocumentType**: id, nome, aplica-se a (trabalhador / obra / viatura / empresa), países, validade em meses, obrigatório.
  - Exemplos **ilustrativos**: A1 (destacamento UE), SIPSI (FR), Carte BTP (FR), Limosa (BE), Meldung (DE), aptidão médica, formação SST, seguro e inspeção de viatura.
- **Document**: id, tipo, owner, número, emissão, validade, verificação (por verificar / verificado / rejeitado), versões.
- **EquipmentItem** (catálogo de EPI, fardamento e ferramentas) e **Delivery** (workerId, itemId, tamanho, quantidade, data, estado: entregue / devolvido / danificado / perdido, data de devolução, por).
- **Issue**: problema reportado pelo encarregado, com obra, categoria, texto e estado.
- **WeekNote**: notas gerais da semana.
- **ActivityEvent**: quando, ator, papel, tipo, refs, texto. **Notification**: destinatário (papel ou persona), lida.
- **OutboxOp**: só na app do trabalhador, enquanto está offline.

**Volume da demonstração.** Todos os dados são gerados de forma determinística à volta da semana atual.

| Entidade | Quantidade |
|---|---|
| Trabalhadores | 42 (6 encarregados) |
| Equipas | 7 |
| Viaturas | 10 (1 em oficina, 1 com inspeção expirada) |
| Obras | 8 |
| Gestores (personas) | 2 |

| País | Obras |
|---|---|
| Portugal | Lisboa, Porto, Braga, Loulé |
| França | Lyon, Paris |
| Bélgica | Bruxelas |
| Alemanha | Munique (perto do limite) |

Os dados incluem:
- 4 semanas de histórico de horas, com estados variados;
- escalas da semana atual e da seguinte, com 5 a 7 conflitos plantados;
- documentos válidos, a expirar (30 dias) e expirados;
- ausências aprovadas e pendentes;
- entregas de equipamento.

---

## 6. Regras de negócio (funções puras e testadas por TDD)

**Horas:**
- normais = mínimo(trabalhadas, 8) por dia útil;
- extra = o que exceder 8h, mais **todas** as horas de sábado e domingo;
- trabalhadas = saída − entrada − pausa;
- a pausa por defeito é de 60 min, configurável nas Definições da demonstração.

**Métricas de obra** (`siteMetrics`):
- **Limite** = horas contratadas ou configuradas;
- **Realizadas** = entradas nos estados submetido, revisto ou aprovado (exclui aberto e rejeitado);
- **Aprovadas** = subconjunto de Realizadas aprovado pelo gestor;
- **Planeadas futuras** = atribuições de hoje em diante que ainda não têm entrada;
- **Saldo disponível** = Limite − Realizadas;
- **Projeção** = Realizadas + Planeadas futuras;
- **Estado**: normal abaixo de 85% da projeção, *atenção* entre 85% e 100%, *excede* acima de 100% ou com Realizadas acima do Limite.

**Disponibilidade** (`availability(worker, date)`): livre, parcial, atribuído, ausente ou inativo.

**Conflitos** (`detectConflicts`). Cada conflito tem tipo, severidade, entidades envolvidas, uma explicação em linguagem simples e `fixes[]` executáveis.

| Tipo | Correções sugeridas |
|---|---|
| Trabalhador em duas obras com horas acima da capacidade ou horários sobrepostos | Mover para X, reduzir horas, remover |
| Trabalhador atribuído num dia de ausência aprovada | Substituir por um trabalhador disponível da mesma categoria (lista ordenada), remover |
| Documento obrigatório do país da obra em falta ou expirado na data | Abrir documento, substituir trabalhador |
| Viatura com dupla reserva no mesmo dia | Escolher alternativa livre com lotação suficiente |
| Viatura indisponível (oficina, inspeção ou seguro expirado) | Escolher alternativa livre |
| Lotação insuficiente para os passageiros | Escolher viatura maior, dividir a equipa |
| Obra sem encarregado num dia com equipa | Definir encarregado |
| Projeção acima do limite da obra | Abrir obra, ajustar limite (registado no histórico) |
| Trabalhador inativo atribuído | Remover |

---

## 7. Papéis e âmbitos (permissões simuladas)

- **Gestor / Administração:** tudo.
- **Encarregado** (persona fictícia, mudável entre os 6). Vê só as suas equipas e obras:
  - a equipa de hoje e da semana;
  - confirmar presenças;
  - registar horas em nome de trabalhadores;
  - rever e devolver horas com motivo;
  - a documentação operacional das suas obras;
  - reportar problemas.
- **Trabalhador** (mobile-first, `/app`):
  - Hoje;
  - Próximas atribuições;
  - Entrada e saída;
  - Pausas;
  - A minha semana;
  - Pedir ausência;
  - Documentos;
  - Notificações;
  - Perfil.
  - Tem ainda um **modo offline simulado**: interruptor "Sem rede", operações pendentes com contador e uma ação "Sincronizar" que aplica a caixa de saída à store com uma animação passo a passo.

`RoleGate` filtra rotas, navegação e selectors pelo âmbito da persona. Uma rota fora de âmbito mostra um estado "Sem acesso neste papel".

---

## 8. Módulos e o que cada um faz de facto

- **Dashboard:**
  - KPIs derivados: ativos, disponíveis hoje, obras em curso, equipas destacadas, planeadas e realizadas da semana, folhas por aprovar, viaturas indisponíveis, documentos a expirar;
  - uma fila de alertas com conflitos;
  - a atividade recente;
  - ações rápidas.
  - **Cada indicador navega para a vista já filtrada.**
- **Planeamento** (maior investimento):
  - Perspetivas: Trabalhadores, Equipas, Obras e Viaturas. Vistas: Semana e Mês (barras de período tipo Gantt).
  - Bandeja de "Disponíveis" filtrável.
  - Arrastar e largar para atribuir, mover (com Alt para copiar) e redimensionar o período.
  - Alternativa por teclado: célula focada, Enter abre "Atribuir…", e o menu de cada bloco tem Mover, Duplicar, Alterar período e Remover.
  - Seleção múltipla com barra de ações em lote.
  - "Copiar semana anterior", com pré-visualização das diferenças e dos conflitos antes de aplicar.
  - "Duplicar escala" de uma equipa para outra semana ou equipa.
  - Assistente "Nova escala" (fluxo 2).
  - Transferir trabalhadores e atribuir viaturas e encarregado.
  - Painel de conflitos com correções.
  - Drawer de detalhe.
  - Anular com Ctrl+Z e "Anular" no toast.
  - **Mobile:** fita de dias, mais cartões por obra com a equipa, e uma *bottom sheet* para atribuir e mover (sem arrastar).
- **Equipas:**
  - criar, editar a composição, definir o encarregado, atribuir viatura e obra;
  - disponibilidade da semana;
  - histórico;
  - duplicar.
- **Trabalhadores:**
  - lista com filtros;
  - criar e editar;
  - ficha com os separadores Visão geral, Profissional, Obras e atribuições, Horas, Documentos, Ausências, Fardamento, Equipamentos e Histórico;
  - ação Transferir (fluxo 3).
- **Obras:**
  - lista com o medidor de horas;
  - assistente de criação (fluxo 1);
  - ficha com Resumo, Cliente, Localização com mapa, Responsáveis, Equipa, Planeamento, Viaturas, Horas (limite, planeadas, realizadas, aprovadas, saldo, projeção), Documentos e Histórico.
- **Viaturas:**
  - a frota com estados e validades;
  - um calendário de disponibilidade semanal;
  - atribuição à equipa e conflitos (fluxo 4);
  - histórico.
- **Horas e aprovações:**
  - registo manual;
  - folhas semanais por trabalhador;
  - fila de revisão (encarregado) e de aprovação (gestor), com aprovação ou rejeição em lote e motivo obrigatório na rejeição ou correção;
  - comparação entre planeado e realizado por dia.
- **Mapas semanais:**
  - semana e filtros (equipa, obra, trabalhador, cliente);
  - template;
  - pré-visualização em "folha" A4;
  - notas da semana;
  - exportação **.xlsx** com exceljs e **impressão** (CSS de impressão A4 horizontal).
- **Documentos:**
  - catálogo;
  - vista por trabalhador e por obra;
  - semáforo de validade;
  - matriz de requisitos por país (com o aviso "ilustrativo, não constitui aconselhamento jurídico");
  - verificação;
  - versões e substituição (fluxo 9).
- **Fardamento e equipamentos:** tamanhos, catálogo, entregas, devoluções, estados e histórico (fluxo 7).
- **Ausências:**
  - pedidos e calendário;
  - aprovar ou rejeitar;
  - um painel de impacto que mostra as atribuições afetadas e os conflitos criados (fluxo 6).
- **Mapa geográfico:** obras no mapa (Leaflet com tiles OSM), filtros por país, estado e risco, e painel lateral com equipa, horas e viaturas.
- **Relatórios:**
  - horas, planeamento, disponibilidade, obras, viaturas e documentos;
  - gráficos SVG simples, seguindo a skill `dataviz`;
  - exportação CSV e XLSX.

**Estados transversais:**
- Vazio, carregamento e erro existem em todos os módulos.
- Os flags de demonstração "Empresa sem dados" e "Simular erro" permitem mostrá-los.
- A identificação "Demonstração · dados fictícios" está sempre visível.

---

## 9. Fluxos obrigatórios: cadeia de efeitos verificável

| # | Fluxo | Ações na store | Onde a mudança tem de aparecer |
|---|---|---|---|
| 1 | Criar obra | `createSite` → `assignTeamToSite` → `bookVehicle` | Lista e ficha da obra, KPI de obras em curso, linhas no Planeamento, mapa, histórico |
| 2 | Criar escala | `createSchedule` (assistente com pré-verificação de conflitos) | Calendário, ficha do trabalhador, Planeadas futuras da obra, KPIs |
| 3 | Transferir trabalhador | `transferWorker(worker, site, período)` | Planeamento, composição da equipa, ficha (separador Obras e Histórico), obra |
| 4 | Viaturas | `bookVehicle`, conflito, `resolveConflict(alternativa)` | Equipa, calendário da viatura, Planeamento, KPI de viaturas |
| 5 | Registar horas | Trabalhador: `clockIn`, `startBreak`, `clockOut`, `submit`. Encarregado: `review`. Gestor: `approve` | Filas de revisão e aprovação, Realizadas e Aprovadas da obra, dashboard |
| 6 | Ausência | `requestAbsence` (trabalhador), `approveAbsence` (gestor) | Disponibilidade, conflitos no Planeamento, notificação ao trabalhador |
| 7 | Equipamento | `recordDelivery` | Ficha (Fardamento e Equipamentos, Histórico), stock do catálogo |
| 8 | Mapas semanais | `buildWeeklyMap`, pré-visualização, `exportXlsx` | O ficheiro descarregado reflete o estado atual |
| 9 | Documentos | `updateDocument` (nova versão e validade) | Alerta desaparece, KPI de documentos a expirar, conflito de documento resolvido |

Cada fluxo terá um teste de store (Vitest) e um teste E2E (Playwright).

---

## 10. Modo apresentação (inspirado no Mesa, integrado no produto)

- O botão "Apresentar" na barra superior abre o **Guião** como drawer à direita, com a app sempre utilizável.
- Há 9 capítulos (os fluxos) mais uma "Visita rápida". Cada passo tem título, uma frase de narração e `run()`.
- `run()` é um **jump idempotente**: prepara os pré-requisitos (`ensure…`), muda o papel e a persona, navega e abre o drawer certo. Depois realça o alvo com um anel Lima e `data-tour`, sem bloquear a interface.
- O **palco dividido** (nos fluxos 5 e 6) mostra o backoffice e um telemóvel com a app do trabalhador lado a lado, sobre o mesmo estado vivo.
- A navegação faz-se com Anterior, Seguinte e as setas. "Explorar livremente" fecha o guião sem repor nada.
- O selector de papel fica sempre na barra superior.

---

## 11. Fases de execução e skills

> Skills confirmadas como instaladas: `using-superpowers`, `brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `test-driven-development`, `systematic-debugging`, `requesting-code-review`, `verification-before-completion`, `dispatching-parallel-agents`, `using-git-worktrees` (superpowers); `engineering:architecture`, `engineering:system-design`, `engineering:testing-strategy`, `engineering:code-review`, `code-review`; `design:design-system`, `design:design-critique`, `design:ux-copy`, `design:accessibility-review`; `anthropic-skills:frontend-design`, `motion-design-web`, `frontend-quality-gate`, `theme-factory`, `web-artifacts-builder`; e ainda `dataviz`, `emil-design-eng`, `break-ui`, `mobile-native`.
> Já usadas nesta fase de planeamento: `using-superpowers`, `brainstorming`, `frontend-design`, `writing-plans`, `architecture`, `system-design`.
> Não aplicáveis: `web-artifacts-builder` (trabalho num repositório React, não num Artifact). `theme-factory` só se for útil; não tenciono usar, porque a paleta é própria. Skills de SEO, marketing e Workspace não entram.

### Fase 0: fundação do repositório
- `git init`, ramo `feat/andaime-v3`.
  - Não uso worktree: o repositório é novo e não há trabalho paralelo a isolar. Fica anotado como desvio consciente de `using-git-worktrees`.
- Escrever o spec `docs/superpowers/specs/2026-10-15-andaime-v3-design.md` (este plano, mais o inventário completo) e os ADRs 0001–0004 (`architecture`).
- **Critério:** spec e ADRs no git.

### Fase 1: UX e design system
- `frontend-design`: rever os tokens e a assinatura com autocrítica.
- `design-system`: escrever `docs/design-system.md` (tokens, componentes, estados).
- `ux-copy`: escrever `docs/copy.md` (glossário, CTAs, mensagens de erro e de vazio) e `src/copy/`.
- `motion-design-web`: especificação de motion (arrastar e largar, drawers, mudanças de estado, movimento reduzido).
- Construir a página `/design` (galeria viva de componentes e estados) e um primeiro ecrã de Planeamento estático.
- Primeira passagem de `design-critique` sobre capturas no browser integrado.
- **Checkpoint não bloqueante:** envio-te as capturas da direção visual e sigo em frente, salvo objeção.

### Fase 2: planos detalhados
- `writing-plans` e `testing-strategy`.
- Planos *rolling-wave* em `docs/superpowers/plans/`, um por bloco da Fase 3, escritos imediatamente antes de cada bloco e com as interfaces reais do código existente. Tarefas pequenas, TDD, critérios de aceitação.

### Fase 3: implementação
Uso `executing-plans` e `subagent-driven-development`. Um implementador de cada vez, porque os módulos partilham a store. Há revisão de spec e de qualidade entre tarefas, e TDD com `test-driven-development` em todo o código de domínio e da store. Uso `systematic-debugging` sempre que algo falha. Faço commits frequentes.

| Bloco | Conteúdo | Aceitação |
|---|---|---|
| 3.1 | Scaffold (Vite, TS strict, Tailwind v4, ESLint, Vitest, Playwright), fontes locais, primitivas UI, `/design` | `npm run typecheck lint test build` passam. `/design` mostra todos os estados |
| 3.2 | `domain/`: weeks, hours, siteMetrics, availability, conflicts, conflictFixes, weeklyMap | Pelo menos 80 testes unitários verdes, com casos-limite (dias repartidos, fim de semana, ano de 53 semanas, ausência parcial) |
| 3.3 | Seed determinístico, store, slices, selectors, persistência versionada, atividade, undo, Reset | Testes de store para todas as ações. Reset e recarregar funcionam |
| 3.4 | AppShell, navegação por pilares, selector de papel e persona, Ctrl K, notificações, Dashboard | KPIs batem com os selectors e cada KPI navega com filtro |
| 3.5 | Planeamento completo (secção 8) e versão mobile | Fluxos 2 e 3 de ponta a ponta. Arrastar e largar e o caminho por teclado são equivalentes |
| 3.6 | Equipas | Composição, encarregado, viatura e duplicação refletidas no Planeamento |
| 3.7 | Trabalhadores (lista, CRUD, ficha com 9 separadores, transferir) | Fluxo 3 |
| 3.8 | Obras (lista, assistente, ficha, medidor) | Fluxo 1 e alertas de limite |
| 3.9 | Viaturas | Fluxo 4 |
| 3.10 | Horas e aprovações | Fluxo 5 (com a app do trabalhador, ver 3.17) |
| 3.11 | Ausências | Fluxo 6 |
| 3.12 | Documentos | Fluxo 9 |
| 3.13 | Fardamento e equipamentos | Fluxo 7 |
| 3.14 | Mapas semanais, templates, Excel, impressão | Fluxo 8. O .xlsx abre e tem o conteúdo esperado (lido de volta num teste) |
| 3.15 | Mapa geográfico | Filtros e painel. Sem tiles mostra um aviso, não um ecrã partido |
| 3.16 | Relatórios e exportações | Números iguais aos selectors |
| 3.17 | Experiência do encarregado e app do trabalhador com offline simulado | Âmbitos respeitados. A caixa de saída sincroniza |
| 3.18 | Modo apresentação (guião, jumps, realce, palco dividido) | Todos os passos correm a partir de qualquer estado, mesmo depois de Reset |
| 3.19 | Suite E2E dos 9 fluxos, mais axe em todas as rotas e nos 3 viewports | Verde |

### Fase 4: revisão
- `frontend-quality-gate`.
- `design-critique` por experiência (Gestor, Encarregado, Trabalhador, Apresentação), com capturas desktop (1440), tablet (834) e mobile (390).
- `accessibility-review`: WCAG 2.1 AA, contraste, teclado, leitores de ecrã, alternativa ao arrastar e largar, foco.
- `break-ui` nos ecrãs densos.
- `code-review` (alto esforço) sobre o diff completo, `requesting-code-review` e `receiving-code-review`.
- Corrigir tudo o que for encontrado.
- `verification-before-completion` com evidência: saída dos testes, build, consola limpa e capturas.
- `dispatching-parallel-agents` **apenas** para revisões independentes e só de leitura (design, a11y, código). Ninguém edita ficheiros em paralelo.

---

## 12. Entregáveis
- Protótipo React em `C:\Users\sangon\Desktop\obras`, com `npm run dev` e `npm run build` (o build estático em `dist/` leva `vercel.json` e `_redirects` para o fallback SPA).
- Todos os módulos, os 3 papéis, a app móvel, o modo apresentação e as exportações.
- Testes: Vitest (domínio, store, componentes) e Playwright (fluxos e a11y).
- `README.md` (arranque, scripts, arquitetura, como demonstrar).
- `docs/design-system.md`, `docs/copy.md`, ADRs e spec.
- `docs/review-report.md`: revisão visual e técnica, com capturas, resultados e o que foi corrigido.
- `docs/limitacoes.md`.

## 13. Limitações conhecidas (assumidas desde já)
- Não há backend, autenticação, multiutilizador real nem segurança. As permissões são apenas simuladas na interface.
- Os dados ficam só no `localStorage` deste browser. Não há sincronização remota.
- O offline é **simulado**: não há service worker nem garantias.
- Os tiles do mapa precisam de internet (OSM).
- Os requisitos documentais por país são ilustrativos e não constituem aconselhamento jurídico.
- O protótipo não substitui processamento salarial nem contabilidade.
- As regras de horas extra são simplificadas (8h por dia e fim de semana) e configuráveis apenas na demonstração.

---

## 14. Verificação de ponta a ponta
1. `npm run typecheck && npm run lint && npm test && npm run build`: tudo verde, com a saída anexada ao relatório.
2. `npx playwright test`: os 9 fluxos e o axe passam em desktop, tablet e mobile.
3. Browser integrado (`preview_start`): percorrer o Guião completo em cada papel, verificar que a consola não tem erros, fazer capturas a 1440, 834 e 390.
4. Exportar um mapa semanal, ler o .xlsx de volta num teste e confirmar que tem as linhas da semana.
5. Repor a demonstração, recarregar e confirmar a persistência ligada e desligada.
