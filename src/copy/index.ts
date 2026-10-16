/**
 * Textos partilhados (pt-PT). Glossário fixo — ver docs/copy.md.
 * Obra · Trabalhador · Equipa · Viatura · Limite de horas · Planeadas · Realizadas · Aprovadas · Saldo · Projeção
 */
export const ROLE_LABEL = {
  gestor: 'Gestor',
  encarregado: 'Encarregado',
  trabalhador: 'Trabalhador',
} as const

export const ROLE_HOME = {
  gestor: '/',
  encarregado: '/encarregado',
  trabalhador: '/app',
} as const

export const DEMO_LABEL = 'Demonstração · dados fictícios'

export const GLOSSARY = {
  limite: 'Horas contratadas ou o limite configurado para a obra.',
  planeadas: 'Horas atribuídas de hoje em diante que ainda não têm registo.',
  realizadas: 'Horas registadas e submetidas (por rever, por aprovar ou aprovadas).',
  aprovadas: 'Horas realizadas já aprovadas pelo gestor.',
  saldo: 'Limite menos horas realizadas.',
  projecao: 'Realizadas mais planeadas: onde a obra vai chegar se o planeamento se cumprir.',
} as const
