import type { Role } from '@/domain/types'
import { demoStore } from '@/store/store'
import { buildWorkbook, downloadWorkbook } from '@/lib/excel/weeklyExcel'
import { buildTimesheetRows, buildWeeklyMap } from '@/domain/weeklyMap'
import type { WorkerTab } from '../worker-app/WorkerScreens'
import { DEMO_SITE_NAME, scenario } from './scenario'

export interface StepCtx {
  navigate: (to: string) => void
}

export interface Step {
  title: string
  /** O que o apresentador diz / o que o cliente deve ver. */
  narration: string
  /** Prepara o estado e navega (idempotente). */
  run: (ctx: StepCtx) => void | Promise<void>
  /** Elemento a realçar (atributo data-tour). */
  target?: string
  /** Mostra o telemóvel do trabalhador ao lado. */
  stage?: WorkerTab
  role: Role
}

export interface Chapter {
  id: string
  title: string
  summary: string
  steps: Step[]
}

const S = () => demoStore.getState()

export const CHAPTERS: Chapter[] = [
  {
    id: 'visita',
    title: 'Visita rápida',
    summary: 'O centro de operações, a assinatura de horas e as três experiências.',
    steps: [
      { role: 'gestor', title: 'Centro de operações', narration: 'Tudo o que o gestor precisa de saber de manhã: quem está disponível, obras em risco, folhas por aprovar, viaturas paradas e documentos. Cada número abre a lista correspondente.', target: 'kpi-conflicts', run: ({ navigate }) => navigate('/') },
      { role: 'gestor', title: 'Horas face ao limite', narration: 'Sólido é realizado, tracejado é planeado e a linha é o limite. Munique já vai passar o limite; Paris está em atenção. Nunca se confunde o planeado com o realizado.', target: 'sites-hours', run: ({ navigate }) => navigate('/') },
      { role: 'gestor', title: 'O quadro de planeamento', narration: 'Trabalhadores por equipa e dias da semana. Arrasta-se para mover, Alt para copiar, e cada dia tem uma régua de 8 horas.', target: 'board', run: ({ navigate }) => navigate(`/planeamento?semana=${scenario.nextMonday()}`) },
      { role: 'gestor', title: 'Conflitos com correção', narration: 'O Andaime explica cada conflito e propõe correções que se aplicam com um clique — e se anulam.', target: 'conflicts-panel', run: ({ navigate }) => navigate(`/planeamento?semana=${scenario.nextMonday()}&painel=conflitos`) },
      { role: 'gestor', title: 'Três experiências', narration: 'Gestor, encarregado e trabalhador. Cada um vê só o que lhe diz respeito. Experimente o seletor no canto superior direito.', target: 'role-switcher', run: ({ navigate }) => navigate('/') },
    ],
  },
  {
    id: 'obra',
    title: '1 · Criar obra',
    summary: 'Cliente, localização, limite de horas, equipa e viatura — e o efeito no dashboard e no planeamento.',
    steps: [
      { role: 'gestor', title: 'Nova obra', narration: 'Uma nova obra começa aqui, com um assistente de cinco passos.', target: 'new-site', run: ({ navigate }) => navigate('/obras') },
      { role: 'gestor', title: 'O assistente', narration: 'Cliente e localização, prazos e limite de horas, equipa e viatura. O passo da equipa mostra de onde ela sai e o que deixa para trás.', run: ({ navigate }) => navigate('/obras/nova') },
      { role: 'gestor', title: 'Obra criada', narration: `Criámos ${DEMO_SITE_NAME} com a equipa Algarve e uma viatura de reserva. Repare no limite de 3 500 h e nas horas planeadas.`, run: ({ navigate }) => navigate(`/obras/${scenario.site()}?tab=resumo`) },
      { role: 'gestor', title: 'O dashboard já sabe', narration: 'Mais uma obra em curso e a nova obra já entra nas horas por obra.', target: 'kpi-sites', run: ({ navigate }) => { scenario.site(); navigate('/') } },
      { role: 'gestor', title: 'E o planeamento também', narration: 'A equipa aparece na nova obra nas próximas duas semanas.', target: 'board', run: ({ navigate }) => navigate(`/planeamento?vista=obras&obra=${scenario.site()}`) },
    ],
  },
  {
    id: 'escala',
    title: '2 · Criar escala',
    summary: 'Semana, equipa, trabalhadores, obra, dias e horário — com conflitos verificados antes de guardar.',
    steps: [
      { role: 'gestor', title: 'Nova escala', narration: 'O assistente guia por semana, equipa, trabalhadores e obra, e só depois mostra os conflitos.', target: 'new-schedule', run: ({ navigate }) => navigate(`/planeamento?semana=${scenario.nextMonday()}`) },
      { role: 'gestor', title: 'O assistente aberto', narration: 'A disponibilidade de cada pessoa aparece dia a dia. Pode juntar alguém de fora da equipa.', run: ({ navigate }) => navigate(`/planeamento?semana=${scenario.nextMonday()}&nova=escala`) },
      { role: 'gestor', title: 'Escala guardada', narration: 'Reforçámos a Escola de Gualtar com o pedreiro de reserva, de segunda a quarta, das 07:30 às 16:30. O calendário já mostra as novas atribuições.', target: 'board', run: ({ navigate }) => { scenario.schedule(); navigate(`/planeamento?semana=${scenario.nextMonday()}&vista=obras&obra=s2`) } },
    ],
  },
  {
    id: 'transferencia',
    title: '3 · Transferir trabalhador',
    summary: 'Nova obra e período, com conflitos detetados; atualiza planeamento, equipa e histórico.',
    steps: [
      { role: 'gestor', title: 'Ficha do trabalhador', narration: 'Da ficha, o botão Transferir pede a obra e o período e mostra os conflitos antes de confirmar.', target: 'transfer-worker', run: ({ navigate }) => navigate(`/trabalhadores/${scenario.transferWorker()}`) },
      { role: 'gestor', title: 'Transferido', narration: 'Uma semana no Hotel Ribeira Douro como reforço. O planeamento mudou e a equipa de origem mantém-no.', target: 'board', run: ({ navigate }) => { scenario.transfer(); navigate(`/planeamento?semana=${scenario.nextMonday()}&q=${encodeURIComponent(S().db.workers[scenario.transferWorker()]?.name ?? '')}`) } },
      { role: 'gestor', title: 'Fica no histórico', narration: 'Cada transferência fica registada na ficha.', run: ({ navigate }) => navigate(`/trabalhadores/${scenario.transferWorker()}?tab=historico`) },
    ],
  },
  {
    id: 'viaturas',
    title: '4 · Viaturas',
    summary: 'Atribuir viatura, detetar o conflito e escolher uma alternativa livre.',
    steps: [
      { role: 'gestor', title: 'A frota', narration: 'Validades, lotação e a ocupação de cada dia. A FR-19-AK tem a inspeção caducada.', target: 'assign-vehicle', run: ({ navigate }) => navigate('/viaturas') },
      { role: 'gestor', title: 'O conflito', narration: 'No planeamento, a viatura indisponível aparece com alternativas livres e com lugares suficientes.', target: 'conflicts-panel', run: ({ navigate }) => navigate(`/planeamento?semana=${scenario.nextMonday()}&vista=viaturas&painel=conflitos`) },
      { role: 'gestor', title: 'Alternativa aplicada', narration: 'A equipa passa a usar a PT-12-WO. A equipa, a viatura e todas as atribuições futuras ficaram atualizadas.', run: ({ navigate }) => { scenario.vehicleSwap(); navigate('/equipas/t4') } },
    ],
  },
  {
    id: 'horas',
    title: '5 · Registar horas',
    summary: 'Ponto no telemóvel → revisão do encarregado → aprovação do gestor → obra atualizada.',
    steps: [
      { role: 'gestor', stage: 'hoje', title: 'O trabalhador regista entrada', narration: 'No telemóvel, um botão. Funciona mesmo sem rede: fica guardado e sincroniza depois.', target: 'worker-clockin', run: ({ navigate }) => { scenario.clockIn(); navigate('/horas?estado=submetido') } },
      { role: 'gestor', stage: 'hoje', title: 'Fim do dia', narration: 'Saída às 17:05 com uma hora de pausa. O registo segue para o encarregado.', run: ({ navigate }) => { scenario.clockOut(); navigate('/horas?estado=submetido') } },
      { role: 'encarregado', title: 'O encarregado revê', narration: 'O encarregado vê só a sua equipa. Valida, corrige com motivo, ou devolve.', target: 'approve-selected', run: ({ navigate }) => { scenario.clockOut(); scenario.role('encarregado'); navigate('/encarregado/horas') } },
      { role: 'gestor', title: 'O gestor aprova', narration: 'O registo revisto chega ao gestor. Aprovado, passa a contar como horas aprovadas da obra.', run: ({ navigate }) => { scenario.reviewed(); scenario.role('gestor'); navigate('/horas?estado=revisto') } },
      { role: 'gestor', title: 'A obra atualiza', narration: 'As horas aprovadas da Atlântida subiram. O medidor e o saldo refletem-no.', run: ({ navigate }) => { scenario.approved(); navigate('/obras/s1?tab=horas') } },
    ],
  },
  {
    id: 'ausencia',
    title: '6 · Pedido de ausência',
    summary: 'O trabalhador pede férias, o gestor vê o impacto e aprova, e o planeamento mostra os conflitos.',
    steps: [
      { role: 'gestor', stage: 'ausencias', title: 'Pedido no telemóvel', narration: 'Férias segunda e terça. O pedido chega ao gestor com o impacto calculado.', target: 'worker-request-absence', run: ({ navigate }) => { scenario.absenceRequest(); navigate('/ausencias') } },
      { role: 'gestor', title: 'Impacto antes de decidir', narration: 'Dias escalados afetados e os conflitos que a aprovação vai criar — antes de carregar em Aprovar.', target: 'approve-absence', run: ({ navigate }) => { scenario.absenceRequest(); navigate('/ausencias') } },
      { role: 'gestor', title: 'Aprovado: o planeamento reage', narration: 'A disponibilidade mudou e o conflito aparece com substitutos livres da mesma categoria.', target: 'conflicts-panel', run: ({ navigate }) => { scenario.absenceApproved(); navigate(`/planeamento?semana=${scenario.nextMonday()}&painel=conflitos`) } },
    ],
  },
  {
    id: 'equipamento',
    title: '7 · Equipamento',
    summary: 'Tamanhos na ficha, entrega registada e histórico atualizado.',
    steps: [
      { role: 'gestor', title: 'Tamanhos e fardamento', narration: 'Os tamanhos estão na ficha e preenchem a entrega automaticamente.', target: 'deliver', run: ({ navigate }) => navigate(`/trabalhadores/${scenario.persona()}?tab=fardamento`) },
      { role: 'gestor', title: 'Entrega registada', narration: 'Uma parka no tamanho certo. O stock desceu e a entrega ficou na ficha.', run: ({ navigate }) => { scenario.delivery(); navigate(`/trabalhadores/${scenario.persona()}?tab=fardamento`) } },
      { role: 'gestor', title: 'Histórico', narration: 'Tudo o que acontece ao trabalhador fica no histórico.', run: ({ navigate }) => navigate(`/trabalhadores/${scenario.persona()}?tab=historico`) },
    ],
  },
  {
    id: 'mapas',
    title: '8 · Mapas semanais',
    summary: 'Semana e obra, pré-visualização e exportação para Excel.',
    steps: [
      { role: 'gestor', title: 'Pré-visualização', narration: 'O mapa de trabalhos da próxima semana, gerado a partir do planeamento: equipas, dias, obra, horário e viatura.', target: 'export-excel', run: ({ navigate }) => navigate(`/mapas?semana=${scenario.nextMonday()}`) },
      { role: 'gestor', title: 'Exportar Excel', narration: 'O ficheiro descarregado reflete o estado atual, incluindo o que mudámos hoje. Também há folha de horas e exportação ERP.', target: 'export-excel', run: async ({ navigate }) => {
        navigate(`/mapas?semana=${scenario.nextMonday()}`)
        const db = S().db
        const map = buildWeeklyMap(db, scenario.nextMonday(), {})
        const wb = await buildWorkbook({ template: 'equipa', map, timesheet: buildTimesheetRows(db, scenario.nextMonday(), {}, S().session.settings), companyName: db.company.name })
        await downloadWorkbook(wb, `Mapa por equipa - Semana ${map.weekNumber}.xlsx`)
      } },
    ],
  },
  {
    id: 'documentos',
    title: '9 · Documentos',
    summary: 'Validade a falhar, alerta, nova versão e o dashboard atualizado.',
    steps: [
      { role: 'gestor', title: 'O que está a falhar', narration: 'Documentos expirados, a expirar, em falta ou por verificar — com o motivo de cada exigência.', run: ({ navigate }) => navigate('/documentos') },
      { role: 'gestor', title: 'O A1 a expirar', narration: 'Este trabalhador vai para França sem A1 válido. O planeamento já o assinala.', target: 'save-document', run: ({ navigate }) => { const t = scenario.documentTarget(); navigate(t ? `/trabalhadores/${t.workerId}?tab=documentos&doc=dt-a1` : '/documentos') } },
      { role: 'gestor', title: 'Renovado', narration: 'Nova versão válida por dois anos. O conflito desaparece e o dashboard tem menos um documento a tratar.', target: 'kpi-documents', run: ({ navigate }) => { scenario.documentRenewed(); navigate('/') } },
    ],
  },
]
