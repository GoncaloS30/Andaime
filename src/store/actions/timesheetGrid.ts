import { hrBookSheets } from '@/domain/hrBook'
import type { ID, ISODate, TimeEntry } from '@/domain/types'
import { dateShort } from '@/domain/weeks'
import { clockOutFor, formatHours } from '@/domain/hours'
import { pushUndo, type StoreApi } from '../api'
import { actorName, log, stamp, uid } from '../helpers'
import type { DemoActions } from '../types'

export interface DayHoursInput {
  workerId: ID
  date: ISODate
  siteId: ID
  hours: number
  reason: string
}

const DEFAULT_IN = '08:00'

export function timesheetGridActions(api: StoreApi): Pick<DemoActions, 'setDayHours' | 'connectOneDrive' | 'syncHrBook'> {
  const { set, get, clock, snapshot } = api
  return {
    /**
     * Grelha da semana: põe o total de horas de um dia. Ajusta a saída do registo (ou cria-o); as horas extra
     * saem das regras de sempre. Exige motivo e fica como correção. Registos aprovados não se mexem.
     */
    setDayHours({ workerId, date, siteId, hours, reason }) {
      if (!reason.trim()) throw new Error('Indique o motivo da alteração')
      if (!(hours > 0 && hours <= 16)) throw new Error('As horas têm de estar entre 0,5 e 16')
      const { db, session } = get()
      const existing = Object.values(db.entries).find((e) => e.workerId === workerId && e.date === date)
      if (existing?.status === 'aprovado') throw new Error('Registo já aprovado: não se altera na grelha')
      const snap = snapshot('Alterar horas na grelha')
      set((s) => {
        pushUndo(s, snap)
        const by = actorName(s.db, s.session)
        const at = stamp(s.session, clock())
        const breakMinutes = session.settings.defaultBreak
        if (existing) {
          const e = s.db.entries[existing.id]!
          const fmt = (x: Pick<TimeEntry, 'clockIn' | 'clockOut' | 'breakMinutes' | 'siteId'>) => `${x.clockIn}–${x.clockOut ?? '—'}, pausa ${x.breakMinutes} min, ${s.db.sites[x.siteId]?.code ?? ''}`
          const before = fmt(e)
          e.siteId = siteId
          e.breakMinutes = hours * 60 > 360 ? breakMinutes : 0
          e.breakStartedAt = null
          e.clockOut = clockOutFor(e.clockIn, hours, e.breakMinutes)
          e.corrections.push({ at, by, reason: reason.trim(), before, after: fmt(e) })
          e.status = s.session.role === 'encarregado' ? 'revisto' : e.status === 'aberto' || e.status === 'rejeitado' ? 'revisto' : e.status
          e.rejectionReason = null
          e.reviewedBy = by
        } else {
          const id = uid('e')
          const brk = hours * 60 > 360 ? breakMinutes : 0
          s.db.entries[id] = {
            id, workerId, siteId, date, clockIn: DEFAULT_IN, clockOut: clockOutFor(DEFAULT_IN, hours, brk), breakMinutes: brk, breakStartedAt: null,
            source: 'encarregado', status: s.session.role === 'gestor' ? 'revisto' : 'submetido',
            corrections: [{ at, by, reason: reason.trim(), before: 'sem registo', after: `${DEFAULT_IN}–${clockOutFor(DEFAULT_IN, hours, brk)}, ${s.db.sites[siteId]?.code ?? ''}` }],
            rejectionReason: null, reviewedBy: s.session.role === 'gestor' ? by : null, approvedBy: null, note: 'Lançado na grelha da semana',
          }
        }
        log(s, clock(), 'horas', `Pôs ${formatHours(hours)} a ${s.db.workers[workerId]?.name} em ${dateShort(date)}: ${reason.trim()}`, { workerId, siteId })
      })
    },

    connectOneDrive(connected) {
      set((s) => {
        s.db.integrations.onedrive.connected = connected
        if (!connected) s.db.integrations.onedrive.books = {}
        log(s, clock(), 'integracoes', connected ? 'Ligou o OneDrive (simulado).' : 'Desligou o OneDrive (simulado).')
      })
    },

    /** Cria ou atualiza o livro do mês (simulado). O período é substituído por inteiro: repetir dá o mesmo livro. */
    syncHrBook(month) {
      if (!get().db.integrations.onedrive.connected) throw new Error('Ligue primeiro o OneDrive')
      const sheets = hrBookSheets(get().db, get().session.settings, month)
      const rows = sheets.reduce((n, sh) => n + sh.rows.length, 0)
      set((s) => {
        const existed = !!s.db.integrations.onedrive.books[month]
        s.db.integrations.onedrive.books[month] = stamp(s.session, clock())
        log(s, clock(), 'integracoes', `${existed ? 'Atualizou' : 'Criou'} o livro de horas do RH de ${month} no OneDrive (simulado): ${sheets.length} folhas, ${rows} linhas.`)
      })
      return { sheets: sheets.length, rows }
    },
  }
}
