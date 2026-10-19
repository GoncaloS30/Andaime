# Relatório de revisão — Andaime V3

Data: 16/10/2026 · Ramo `feat/andaime-v3` · Protótipo demonstrativo com dados fictícios.

## 1. Evidência (execução fresca antes da entrega)

| Verificação | Comando | Resultado |
|---|---|---|
| TypeScript strict | `npx tsc -b` | exit 0 |
| Lint | `npx eslint .` | 0 erros, 0 avisos |
| Testes unitários e de store | `npx vitest run` | **104/104** em 17 ficheiros |
| Build de produção | `npm run build` | exit 0 (arranque 601 KB / 190 KB gzip; guião, paleta de comandos, palco e cada módulo carregados a pedido; ExcelJS 929 KB só ao exportar) |
| Dependências | `npm audit` | **0 vulnerabilidades** (`uuid` forçado a ≥ 11.1.1) |
| Lighthouse (Edge, desktop) | `lighthouse --preset=desktop` | Painel 99 · Planeamento 98 de desempenho; **100** acessibilidade e boas práticas |
| Lighthouse (telemóvel, 4G lento + CPU 4×) | `lighthouse` | Painel 83 · Planeamento 66–78 · Obra 61–73 (variável entre execuções); FCP 2,2 s; **100** acessibilidade e boas práticas. Relatórios em `docs/review/lighthouse` |
| E2E + acessibilidade + quality gate | `npx playwright test` (Edge) | **29/29** — desktop 1440, tablet 834, telemóvel (Pixel 7) |

Os 29 testes E2E cobrem: os **9 fluxos** pela interface; o **guião de apresentação** completo (todos os passos de todos os capítulos sem erro); **axe WCAG 2.1 AA** em 20 rotas do gestor, 4 separadores da ficha, 5 rotas do encarregado e 5 ecrãs da app (zero violações sérias/críticas); alternativa por teclado ao arrastar; arrastar um bloco para outro trabalhador e redimensionar o período pela pega; sem overflow em 1440/1024/768/390/360; landmarks, um `h1` por página, imagens com `alt`; "Saltar para o conteúdo" e foco visível; erros de formulário anunciados; `prefers-reduced-motion`; carregamento visível com JavaScript lento. Capturas em `docs/review/screens` (7 ecrãs × 5 larguras).

Regressão de "Anular" verificada em ciclo vermelho-verde (sem a correção o teste falha; com a correção passa).

## 2. Testes unitários por área

- Domínio (TDD, vermelho antes de verde): semanas ISO (incl. semana 53), horas normais/extra/pausas/fim de semana, métricas de obra (limite, realizadas, aprovadas, planeadas futuras, saldo, projeção, limiares 85 %/100 %), disponibilidade (ausência total/parcial/pedido/inativo), documentos (estados, versões, requisitos por país), **9 tipos de conflito** com correções, planeador de cópia de semana, mapas semanais e códigos ERP, intervalos de dias.
- Semente determinística: volumes, equipas coerentes, conflitos plantados detetados, personas.
- Store: os 9 fluxos ao nível da store, offline/sincronização (hora real do registo preservada), anular (incl. depois de aprovar e de criar obra), correções de conflitos, copiar semana, repor, papéis.
- Excel: workbook gerado, gravado e lido de volta (mapa por equipa, por obra, ERP). CSV pt-PT. Contraste dos avatares.

## 3. Problemas encontrados na revisão e corrigidos

| Origem | Problema | Correção |
|---|---|---|
| Browser (sistemático) | Conflitos da semana errada no quadro ao mudar de semana: `useDerived` ignorava valores externos | `useDerived(fn, deps)` + teste (vermelho → verde) |
| Crítica visual | Código da obra cortado nos blocos ("25-…") | Bloco em duas linhas, horas a 1 casa decimal |
| Crítica visual | Folhas por aprovar contavam registos (162) e não folhas | Contagem trabalhador × semana em KPI, menu e encarregado |
| Crítica visual | Blocos de hoje com ✓ para registos sem saída | Ponto "a decorrer"; ✓ só com saída |
| Crítica visual | Código repetido em todos os blocos da equipa | Código discreto na obra habitual; exceções em destaque |
| Crítica visual | Folhas de horas com diferença planeado/realizado injusta (semana inteira) | Planeado comparável só até hoje; contagens por estado |
| Crítica visual | Mapa semanal com dias repetidos e quebrados | "seg–sex", dias por pessoa só quando diferem |
| Crítica visual | Palco dividido espremia o conteúdo | Barra lateral recolhe para ícones; telemóvel mais estreito |
| Guião | Narração prometia pausa que não era registada | Pausa 12:00–13:00 no fim de dia simulado |
| Guião (E2E) | Diálogo modal bloqueava o painel do guião | Guião acima das camadas modais e clicável |
| Guião (E2E) | Erro Leaflet `_leaflet_pos` ao navegar durante animação | Enquadramento sem animação |
| Quality gate | Overflow a 1024, 390 e 360 px (barra superior, mapas) | Barra superior por patamares; cabeçalho dos mapas com quebra |
| Quality gate | Primeiro Tab não chegava a "Saltar para o conteúdo" | Foco no conteúdo só ao mudar de página |
| Quality gate | JS lento: página antiga parada sem indicação (transição do router) | Rotas com `lazy` do router + barra de progresso `role=status` |
| axe | Contraste da barra lateral (texto a 40–50 %), avatares, "Folga"/"Livre", calendário da viatura | Tokens ajustados; fundo do avatar escurecido até 4,5:1 (testado) |
| axe | `role=grid` sem células; nomes acessíveis diferentes do texto visível (seletor de papel, bandeja, blocos, cabeçalhos do mês) | Região com nome; nomes começam pelo texto visível + contexto (trabalhador e dia) |
| axe | Separadores a apontar para painel inexistente; ligação só distinguível pela cor; `aria-label` sem papel no esqueleto | `TabPanel`; sublinhado; `role=status` |
| Code review | "Anular" depois de aprovar/rever desfazia outra ação | Snapshot do DB completo (estrutura partilhada) e pontos de anulação nas ações de horas |
| Code review | Anular "criar obra" deixava cliente órfão | Idem (snapshot completo) |
| Code review | Registo manual permitia duplicar o dia | Botão bloqueado com duplicado; obra sugerida pelo dia escolhido |
| Code review | Anular na folha móvel revertia só metade | Anula os passos todos |
| Code review | Selo "Por sincronizar" nunca aparecia | Verifica a caixa de saída |
| Code review | Pré-visualizações repetidas por alternativa de viatura | Alternativas já filtradas, sem pré-visualização por item |
| Copy | Concordância e género ("Férias aprovada", "escalado", "1 ausentes", "1 expirados") | Frases neutras e concordância corrigida |
| Code review (adiado, depois feito) | Pluralização repetida em 15 sítios, com erros ("1 registo aprovados", "1 registo rejeitados", "1 atribuições") | `plural()` único em `src/lib/plural.ts` (testado), com nome e particípio concordantes |
| Lighthouse | Telemóvel: semente com procura O(n²) no arranque (TBT alto) | Índice por trabalhador × dia (desempenho 67–74 → 77–80 no painel antes do ecrã de arranque) |
| Lighthouse | Ecrã em branco ≈ 3,4 s em 4G lento | Ecrã de arranque estático no `index.html` (FCP ≈ 2,2 s); guião, paleta e palco fora do arranque (−41 KB) |
| Pedido | Sem redimensionamento por arrasto | Pega no fim de cada bloco (de hoje em diante) + deteção de colisão pelo ponteiro |

## 3b. Bloco 1 da V3.1 — fotos (17/10/2026)

| Verificação | Resultado |
|---|---|
| `npx tsc -b`, `npx eslint .` | 0 erros |
| `npx vitest run` | **127/127** em 22 ficheiros (novos: domínio das fotos, seed com fotos, IndexedDB, `setPhoto`, `<Photo>`, `Avatar`) |
| `npx playwright test` | **33/33** (novos: fluxo 15 — carregar foto, refletir no planeamento e persistir; obras em cartões; repor volta às fotos de banco) |
| Bundle inicial | +3 KB gzip (199,5 → 202,5 KB); as fotos (4,4 MB) nunca entram no bundle |
| Lighthouse desktop | Obras 96 · Planeamento 90–97; CLS 0–0,005 |
| Lighthouse telemóvel (A/B com o build anterior, mesmas condições) | Obras 62–72 vs 66–71; LCP 4,1–4,3 s vs 3,5–3,6 s; painel igual. Medições absolutas variam com a carga da máquina |

**Corrigido durante o bloco:**
- Seed partilhava objetos de gestores com o catálogo: a store congela o estado e o seed seguinte falhava (teste de regressão).
- Os E2E corriam contra outra aplicação que ocupava a porta 4173: passam a usar a porta 4823 e a não reutilizar servidores.
- LCP de 7 s nas obras em telemóvel (capa de 1280 px): tamanho intermédio de 640 px, prioridade só na primeira capa e, no telemóvel, cartão compacto com miniatura.
- CLS de 0,028 no planeamento (anterior às fotos): a troca de fonte fazia saltar os filtros para outra linha; quebra de linha fixa.
- Ficha da viatura com scroll horizontal (anterior às fotos, apanhado ao acrescentar o ecrã às capturas): grelha com `minmax(0, …)`.
- Tira da semana na ficha do trabalhador sobrepunha as horas a 360–390 px.
- Recortes de retratos com a cabeça cortada: recorte a partir de cima e recorte manual em 4 fotos.

## 3c. V3.1 completa — blocos 2 a 7 (19/10/2026)

Funcionalidades do Lyrical Design e fotos (spec `docs/superpowers/specs/2026-10-16-andaime-lyrical-fotos-design.md`). Cada bloco ficou num PR empilhado: #14 (diário), #16 (dormidas), #17 (ausências e agenda), #18 (horas), #19 (EPI e definições) e o PR do bloco 7 (fecho).

| Verificação | Comando | Resultado |
|---|---|---|
| TypeScript strict | `npm run build` (`tsc -b` + Vite) | exit 0. Bundle inicial de 615 KB (194 KB gzip); os módulos novos carregam à parte |
| Lint | `npx eslint src e2e` | 0 erros |
| Testes unitários e de store | `npx vitest run` | **182/182** em 34 ficheiros |
| Dependências | `npm audit` | **0 vulnerabilidades** |
| E2E, acessibilidade e quality gate | `npx playwright test` (Edge) | **47/47** numa só execução (5,7 min), com os 17 fluxos |
| axe WCAG 2.1 AA | `e2e/a11y.spec.ts` | 0 violações sérias ou críticas em 30 rotas do gestor, 6 separadores da ficha, 6 rotas do encarregado e 5 ecrãs da app |
| Quality gate | `-g @quality` | 16 ecrãs × 5 larguras sem overflow; capturas em `docs/review/screens` |
| Lighthouse desktop | `lighthouse@12 --preset=desktop` | Dormidas 94 · Diário 93 · Totais de horas 95; **100** em acessibilidade e boas práticas; CLS ≤ 0,001 |
| Lighthouse telemóvel (4G lento + CPU 4×) | `lighthouse@12` | Dormidas 61 · Diário 58 · Totais de horas 60; **100** em acessibilidade e boas práticas. O LCP é a capa da obra, que já carrega com prioridade alta; o atraso vem do arranque do JavaScript, a limitação já conhecida. Relatórios em `docs/review/lighthouse/v31-*.json` |

Os novos testes E2E cobrem:
- fluxo 10, dormidas: o hotel marcado aparece na ficha e na app;
- fluxo 11, diário: 2 fotos, linha do tempo e um Word lido de volta com as imagens;
- fluxo 12, férias: mapa do ano, Agenda e Google simulado sem duplicar;
- fluxo 13, livro do RH: Excel lido de volta e OneDrive sem duplicar;
- fluxo 14, grelha da semana: 10 h numa célula, extra recalculado e correção com motivo;
- fluxo 15, fotos;
- fluxo 16, folha de entrega: artigo novo e Excel;
- fluxo 17, cópia da demonstração: exportar, importar e recusar um ficheiro inválido;
- capítulos 10 e 11 do guião, com o efeito visível no telemóvel ao lado.

**Corrigido durante os blocos 2 a 7:**

| Origem | Problema | Correção |
|---|---|---|
| E2E | Os testes dependiam do dia em que corriam (ao fim de semana não havia trabalho atribuído) | Relógio fixo em `open()` |
| E2E | Grelha: o teste escolhia um registo da semana errada e assumia que todos entravam às 08:00 | Registo da semana anterior; afirma 600 minutos trabalhados |
| Build | `tsc -b` falhava nos E2E que liam Excel com `xlsx.load(Buffer)` (vinha do bloco 5) | `xlsx.readFile(caminho)`, como nos restantes |
| axe | Seletor de ficheiro escondido da cópia sem nome acessível | `aria-label` e fora da ordem de tabulação (abre pelo botão visível) |
| axe | Agenda: dias de outros meses e horas dentro dos eventos com contraste abaixo de 4,5:1 | Tons de texto mais escuros |
| Quality gate | Horas a 360 px: o seletor de vistas (4 opções) saía 8 px da página | O seletor desliza na horizontal dentro da sua largura |
| Guião | Realçar um painel mais alto do que o ecrã deslocava a página inteira | Alvos altos com `block: 'nearest'` |
| Crítica visual | Palco dividido: os números da caixa Horas da obra sobrepunham-se e as linhas das dormidas ficavam espremidas | Grelha `auto-fit` na caixa Horas; o passo com telemóvel mostra a ficha (Alojamento) em vez da lista |
| E2E | O grupo axe do planeamento (5 rotas pesadas) excedia os 150 s com a suite toda em paralelo | Grupos de 3 rotas: a suite passou a correr em 5,7 min, em vez de 9,6 |
| Revisão | Importar uma cópia: as fotos eram repostas depois dos dados e os ecrãs não as encontravam logo | Repor primeiro as fotos e só depois substituir os dados |
| Bundle | Os créditos das fotos (URL e autor de cada uma) iam entrar no bundle inicial pelo manifesto | Módulo gerado à parte, carregado só pela página de créditos |
| Build | Importação dinâmica sem efeito (constantes da folha de entrega vinham do módulo do Excel) | Constantes passaram para `src/domain/equipment.ts` |

## 4. Avaliação visual final

- **Gestor:** centro de operações com hierarquia clara (faixa de indicadores ligáveis → horas por obra → no terreno → alertas e decisões). A assinatura tracejado/sólido/limite é consistente no medidor, no quadro, no gráfico semanal e nas legendas. O quadro de planeamento é denso mas legível; conflitos explicados com correções de um clique e "Anular".
- **Encarregado:** ecrã "Hoje" focado em presenças, com ações diretas (Presente/Faltou, registar horas).
- **Trabalhador:** app de polegar (botões de 56 px), um ecrã por tarefa, offline explícito.
- **Responsivo:** verificado em 5 larguras; o planeamento em telemóvel usa uma representação própria (fita de dias + cartões por obra), não uma tabela comprimida.

## 5. Skills usadas e desvios ao plano

Usadas: `using-superpowers`, `brainstorming`, `writing-plans`, `engineering:architecture`, `engineering:system-design`, `frontend-design`, `design:design-system`, `design:ux-copy`, `motion-design-web`, `dataviz` (validador de paleta), `test-driven-development`, `systematic-debugging`, `built-in-browser`, `frontend-quality-gate`, `design:design-critique`, `design:accessibility-review`, `code-review` (esforço alto), `verification-before-completion`.

Desvios (assumidos):
- **Execução inline** com `executing-plans` em vez de `subagent-driven-development`, para manter a coerência visual e da store partilhada; `dispatching-parallel-agents` não foi usado (revisões feitas em sequência neste contexto).
- `writing-plans`: plano detalhado escrito para o bloco 1 (fundação); os blocos seguintes seguiram o plano mestre aprovado sem documento próprio por bloco.
- `using-git-worktrees`: não usado (repositório novo, sem trabalho paralelo) — ramo `feat/andaime-v3`.
- TDD estrito no domínio e na store; nos componentes a cobertura vem dos E2E; alguns testes de utilitários (CSV, avatar, regressões da revisão) foram escritos junto ou depois da correção.
- `testing-strategy`, `requesting-code-review`, `receiving-code-review`, `theme-factory`, `web-artifacts-builder`: não invocadas (sem necessidade concreta; revisão feita com `code-review`).
- Lighthouse executado com Edge (`CHROME_PATH`) via `npx lighthouse@12`; o desempenho em telemóvel continua abaixo de 90. Ver `docs/limitacoes.md`.
