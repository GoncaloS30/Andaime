# Relatório de revisão — Andaime V3

Data: 16/10/2026 · Ramo `feat/andaime-v3` · Protótipo demonstrativo com dados fictícios.

## 1. Evidência (execução fresca antes da entrega)

| Verificação | Comando | Resultado |
|---|---|---|
| TypeScript strict | `npx tsc -b` | exit 0 |
| Lint | `npx eslint .` | 0 erros, 0 avisos |
| Testes unitários e de store | `npx vitest run` | **102/102** em 16 ficheiros |
| Build de produção | `npm run build` | exit 0 (bundle principal 477 KB; ExcelJS 929 KB carregado só ao exportar) |
| E2E + acessibilidade + quality gate | `npx playwright test` (Edge) | **23/23** — desktop 1440, tablet 834, telemóvel (Pixel 7) |

Os 23 testes E2E cobrem: os **9 fluxos** pela interface; o **guião de apresentação** completo (todos os passos de todos os capítulos sem erro); **axe WCAG 2.1 AA** em 20 rotas do gestor, 4 separadores da ficha, 5 rotas do encarregado e 5 ecrãs da app (zero violações sérias/críticas); alternativa por teclado ao arrastar; sem overflow em 1440/1024/768/390/360; landmarks, um `h1` por página, imagens com `alt`; "Saltar para o conteúdo" e foco visível; erros de formulário anunciados; `prefers-reduced-motion`; carregamento visível com JavaScript lento. Capturas em `docs/review/screens` (7 ecrãs × 5 larguras).

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
- Redimensionar períodos por arrasto não implementado (alternativa "Alterar período" no painel). Lighthouse não executado. Ver `docs/limitacoes.md`.
