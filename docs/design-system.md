# Design system — Andaime

Galeria viva: rota `/design`. Tokens em `src/styles/index.css` (`@theme`). Componentes em `src/ui`.

## Princípio e assinatura

Centro de operações de obra: régua, fita métrica, pinho de cofragem, cal e betão.
**Tracejado = planeado · sólido = realizado · sólido escuro = aprovado · linha = limite.** A mesma linguagem aparece no medidor de horas da obra, nos blocos do quadro de planeamento, no gráfico semanal e na legenda — é a forma visual de nunca confundir horas planeadas com realizadas. Cada dia do quadro tem uma **régua de capacidade** de 8 marcas.

## Cor

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `pinho` | `#13342a` | Barra lateral, botão principal, aprovado | branco 13,5:1 |
| `musgo` | `#24543f` | Hover sobre pinho | branco 8,7:1 |
| `realizado` | `#6f9a84` | Horas realizadas por aprovar (só preenchimento) | — |
| `cal` | `#f5f5f0` | Fundo; superfícies `#ffffff` | — |
| `ink` / `ink-2` / `ink-3` | `#1f2421` / `#545b56` / `#666d68` | Texto principal / secundário / apoio | 15,8 / 7,0 / 5,3:1 |
| `ink-4`, `line`, `line-2` | | Desativado e réguas (não usar para texto) | |
| `lima` | `#c8e26a` | Acento: hoje, seleção, foco em fundo escuro. **Nunca texto sobre branco** | pinho sobre lima 9,4:1 |
| `ambar` (+`-ink`, `-soft`) | `#c98a12` | Aviso — o preenchimento; o texto usa `#7f5505` | 5,8:1 |
| `tijolo` (+`-ink`, `-soft`) | `#b03a2e` | Erro, destrutivo, excesso de limite | branco 6,0:1 |
| `aco`, `ok` | | Informação, sucesso | ≥ 4,6:1 |

**Paleta das obras** (`src/domain/palette.ts`): 12 cores categóricas, ordem fixa, validadas com o validador da skill *dataviz* (banda de luminosidade, croma, separação CVD ≥ 8, separação normal ≥ 15, contraste ≥ 3:1 — todos PASS). A identidade nunca depende só da cor: o código da obra acompanha sempre a cor. Os avatares escurecem a cor da equipa até as iniciais brancas terem ≥ 4,5:1 (`avatarBackground`, testado).

## Tipografia

**Archivo Variable** com eixo de largura — uma família, três personalidades: `font-expanded` (títulos, números de KPI), normal (corpo, 14 px base), `font-condensed` (cabeçalhos densos do quadro). **JetBrains Mono** para códigos, matrículas e horas, com `tabular-nums`. Servidas localmente (`@fontsource`), sem Google Fonts em runtime.
Escala: 12 · 13 · 14 · 16 · 20 · 24 · 32 · 44.

## Espaço, raio, elevação

Grelha de 4 pt. Raios 3/4/8/12. Hierarquia por fundos (cal vs branco) e réguas finas; sombras só em popovers (`e1`) e drawers/modais (`e2`).

## Movimento

Uma curva `cubic-bezier(.2,.7,.2,1)`; 120 ms (botões), 180 ms (popovers, toasts), 260 ms (drawers, folhas). Arrastar: fantasma inclinado 1,5° e célula de destino em Lima. Conflito focado: pulso único. KPIs: contagem curta quando mudam. Barra de progresso no topo enquanto um módulo carrega. Com `prefers-reduced-motion` tudo fica instantâneo (testado em E2E).

## Componentes

| Componente | Variantes / notas | Acessibilidade |
|---|---|---|
| `Button`, `IconButton`, `buttonStyles` | primary, secondary, ghost, accent, danger, quiet · sm/md/lg · loading | `aria-busy`; ícone exige `label` |
| `Field` + `Input`/`Select`/`Textarea` | ajuda, erro, opcional | label ligado por id, erro com `role=alert` e `aria-describedby` |
| `Switch`, `Segmented`, `ChipToggle`, `Checkbox` | | `role=switch`; radiogroup com setas; `aria-pressed` |
| `Badge`, `SiteCode`, `Plate`, `Kbd`, `Avatar` | 7 tons | estado sempre com texto e ponto, nunca só cor |
| `Drawer`, `Dialog` (Radix) | lateral em desktop, folha inferior em telemóvel | foco preso, Esc fecha, foco regressa |
| `Tabs`, `Menu`, `Popover`, `Tooltip` (Radix) | | setas, Esc |
| `KpiStrip` | faixa com réguas, não cartões | cada indicador é uma ligação |
| `HoursGauge`, `GaugeLegend`, `HoursStatus` | normal / atenção / excede / sem limite | `role=img` com descrição completa |
| `EmptyState`, `ErrorState`, `Skeleton(Rows)` | | erro com `role=alert`, carregamento com `role=status` |
| Quadro: `AssignmentChip`, `DropCell`, `DayHeader` | planeado tracejado, com registo ✓, a decorrer ●, conflito, responsável | nome inclui trabalhador e dia; alternativa ao arrastar pelo botão + e pelo menu do bloco; anúncios do arrastar em pt-PT |

## Estados transversais

Vazio, erro e carregamento em todos os módulos (`ModuleGuard`), simuláveis no menu Demonstração.
