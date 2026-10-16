/**
 * Paleta categórica das obras (e das equipas, que herdam a cor da obra).
 * Validada com o validador da skill dataviz (modo claro): banda de luminosidade, croma,
 * separação CVD ≥ 8, separação normal ≥ 15 e contraste ≥ 3:1 — todos PASS.
 * A identidade nunca depende só da cor: o código da obra acompanha sempre a cor.
 * Ordem fixa; acima de 12 obras usa-se o cinzento "Outras".
 */
export const SERIES = [
  '#2a78d6', '#d4652f', '#1a9e72', '#8a4fc7', '#c0457f', '#3f8a2a',
  '#4a3aa7', '#8f8a14', '#2196a8', '#b0503a', '#5d6fd8', '#a0397a',
] as const

export const SERIES_OTHER = '#7d847f'

export function seriesColor(index: number): string {
  return SERIES[index] ?? SERIES_OTHER
}
