import { Cloud, FileSpreadsheet, Link2, RefreshCw, Unlink } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { hrBookSheets } from '@/domain/hrBook'
import { dateShort, monthLabel } from '@/domain/weeks'
import { useDemo } from '@/store/store'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Select } from '@/ui/Field'
import { Panel } from '@/ui/Layout'

function lastMonths(today: string, n: number) {
  const [y, m] = today.split('-').map(Number) as [number, number]
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.UTC(y, m - 1 - i, 1))
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

/** Livro de horas do RH: descarregar o Excel do mês e manter o livro partilhado no OneDrive (simulado). */
export function HrBookPanel() {
  const today = useDemo((s) => s.session.today)
  const settings = useDemo((s) => s.session.settings)
  const od = useDemo((s) => s.db.integrations.onedrive)
  const connect = useDemo((s) => s.connectOneDrive)
  const sync = useDemo((s) => s.syncHrBook)
  const [month, setMonth] = useState(today.slice(0, 7))
  const preview = useDerived(({ db }) => {
    const sheets = hrBookSheets(db, settings, month)
    return { db, sheets, rows: sheets.reduce((n, s) => n + s.rows.length, 0), absences: sheets.reduce((n, s) => n + s.rows.filter((r) => r.absence).length, 0) }
  }, [month])
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const { buildHrBook } = await import('@/lib/excel/hrBookExcel')
      const { downloadWorkbook } = await import('@/lib/excel/weeklyExcel')
      const codeByOrder = Object.fromEntries(Object.values(preview.db.sites).map((s) => [s.erpOrder, s.code]))
      const wb = await buildHrBook(month, preview.sheets, settings, codeByOrder)
      await downloadWorkbook(wb, `livro-horas-rh-${month}.xlsx`)
      toast.success('Livro de horas descarregado', { description: `${preview.sheets.length} folhas · ${preview.rows} linhas` })
    } finally {
      setBusy(false)
    }
  }

  const updated = od.books[month]
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title="Livro de horas do RH" description="Uma folha por colaborador, no formato do RH. Dias de ausência vão com 0 h e o motivo na coluna Ausência.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm" htmlFor="hr-month">
            Mês
            <Select id="hr-month" value={month} onChange={(e) => setMonth(e.target.value)} className="mt-0.5 w-48">
              {lastMonths(today, 6).map((m) => <option key={m} value={m}>{monthLabel(`${m}-01`)}</option>)}
            </Select>
          </label>
          <Button variant="primary" icon={<FileSpreadsheet className="size-4" />} loading={busy} disabled={!preview.sheets.length} onClick={() => void download()}>Descarregar Excel</Button>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div><dt className="text-xs text-ink-3">Folhas</dt><dd className="font-expanded text-xl font-semibold tabular">{preview.sheets.length}</dd></div>
          <div><dt className="text-xs text-ink-3">Linhas</dt><dd className="font-expanded text-xl font-semibold tabular">{preview.rows}</dd></div>
          <div><dt className="text-xs text-ink-3">Dias de ausência</dt><dd className="font-expanded text-xl font-semibold tabular">{preview.absences}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-ink-3">Colunas: Data · Horas · Obra · Atividade (fórmula para a folha Tabelas: {settings.activityCodes.normal}/{settings.activityCodes.ate9}/{settings.activityCodes.extra}) · Ordem · Ausência.</p>
      </Panel>
      <Panel title="OneDrive" actions={<Badge tone="info">Simulado</Badge>} description="Demonstração: não liga a nenhuma conta real e nunca pede credenciais." className="h-fit">
        {od.connected ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-sm text-ok"><Cloud className="size-4" aria-hidden /> Ligado</p>
            <Button
              icon={<RefreshCw className="size-4" />}
              onClick={() => {
                const r = sync(month)
                toast.success(updated ? 'Livro do mês atualizado' : 'Livro do mês criado', { description: `${r.sheets} folhas, ${r.rows} linhas. O período é substituído por inteiro: repetir dá o mesmo livro.` })
              }}
            >
              {updated ? `Atualizar o livro de ${monthLabel(`${month}-01`).split(' ')[0]}` : `Criar o livro de ${monthLabel(`${month}-01`).split(' ')[0]}`}
            </Button>
            {updated && <p className="text-xs text-ink-3">Última atualização: {dateShort(updated.slice(0, 10))}, {updated.slice(11, 16)}</p>}
            <Button variant="ghost" icon={<Unlink className="size-4" />} onClick={() => { connect(false); toast('OneDrive desligado (simulado)') }}>Desligar</Button>
          </div>
        ) : (
          <Button icon={<Link2 className="size-4" />} onClick={() => { connect(true); toast.success('OneDrive ligado (simulado)') }}>Ligar OneDrive</Button>
        )}
      </Panel>
    </div>
  )
}
