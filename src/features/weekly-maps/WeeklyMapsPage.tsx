import { ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ModuleGuard } from '@/app/ModuleGuard'
import { ENTRY_STATUS } from '@/domain/labels'
import type { EntryStatus } from '@/domain/types'
import { buildTimesheetRows, buildWeeklyMap, type MapFilters } from '@/domain/weeklyMap'
import { addDays, dateNumeric, dayShort, isoWeek, weekStart } from '@/domain/weeks'
import { TEMPLATE_HINT, TEMPLATE_LABEL, buildWorkbook, downloadWorkbook, type MapTemplate } from '@/lib/excel/weeklyExcel'
import { useDemo } from '@/store/store'
import { Button, IconButton } from '@/ui/Button'
import { Field, Segmented, Select, Textarea } from '@/ui/Field'
import { PageHeader } from '@/ui/Layout'

/** Fluxo 8 — semana e obra → pré-visualizar equipa, horários e viaturas → exportar Excel ou imprimir. */
export function WeeklyMapsPage() {
  const [sp, setSp] = useSearchParams()
  const today = useDemo((s) => s.session.today)
  const db = useDemo((s) => s.db)
  const settings = useDemo((s) => s.session.settings)
  const week = sp.get('semana') && /^\d{4}-\d{2}-\d{2}$/.test(sp.get('semana')!) ? weekStart(sp.get('semana')!) : addDays(weekStart(today), 7)
  const template = (['equipa', 'obra', 'horas', 'erp'].includes(sp.get('template') ?? '') ? sp.get('template') : 'equipa') as MapTemplate
  const filters: MapFilters = { teamId: sp.get('equipa') || undefined, siteId: sp.get('obra') || undefined, workerId: sp.get('trabalhador') || undefined, clientId: sp.get('cliente') || undefined }
  const set = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n }, { replace: true })
  const map = useMemo(() => buildWeeklyMap(db, week, filters), [db, week, filters.teamId, filters.siteId, filters.workerId, filters.clientId]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => buildTimesheetRows(db, week, filters, settings), [db, week, settings, filters.teamId, filters.siteId, filters.workerId, filters.clientId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false)

  const exportXlsx = async () => {
    setBusy(true)
    try {
      const wb = await buildWorkbook({ template, map, timesheet: rows, companyName: db.company.name })
      const suffix = filters.siteId ? ` - ${db.sites[filters.siteId]?.code}` : filters.teamId ? ` - ${db.teams[filters.teamId]?.name}` : ''
      await downloadWorkbook(wb, `${TEMPLATE_LABEL[template]} - Semana ${map.weekNumber}${suffix}.xlsx`)
      toast.success('Excel exportado', { description: `${TEMPLATE_LABEL[template]} da semana ${map.weekNumber}, com os dados atuais.` })
    } catch {
      toast.error('Não foi possível gerar o Excel. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const empty = template === 'horas' || template === 'erp' ? rows.length === 0 : map.groups.length === 0

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        className="no-print"
        title="Mapas semanais"
        description="O mapa de trabalhos da semana, gerado a partir do planeamento e das horas. Exporte em Excel ou imprima."
        actions={
          <>
            <Button icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={empty}>Imprimir</Button>
            <Button variant="primary" icon={<FileDown className="size-4" />} loading={busy} onClick={exportXlsx} disabled={empty} data-tour="export-excel">Exportar Excel</Button>
          </>
        }
      />
      <ModuleGuard empty={{ icon: <FileSpreadsheet />, title: 'Sem mapas', text: 'Quando houver planeamento, o mapa de cada semana é gerado automaticamente.' }}>
        <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
          <aside className="no-print flex flex-col gap-4" aria-label="Opções do mapa">
            <div className="flex items-center justify-between rounded-md border border-line bg-surface p-1">
              <IconButton label="Semana anterior" onClick={() => set('semana', addDays(week, -7))}><ChevronLeft className="size-4" /></IconButton>
              <span className="text-center text-sm">
                <span className="block font-semibold">Semana {isoWeek(week)}</span>
                <span className="text-xs text-ink-3">{map.label}</span>
              </span>
              <IconButton label="Semana seguinte" onClick={() => set('semana', addDays(week, 7))}><ChevronRight className="size-4" /></IconButton>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Template</legend>
              <div className="flex flex-col gap-1.5">
                {(Object.keys(TEMPLATE_LABEL) as MapTemplate[]).map((t) => (
                  <label key={t} className={`flex cursor-pointer gap-2.5 rounded-md border px-3 py-2 ${template === t ? 'border-pinho bg-lima-soft/50' : 'border-line bg-surface hover:border-ink-4'}`}>
                    <input type="radio" name="template" className="mt-0.5 accent-pinho" checked={template === t} onChange={() => set('template', t === 'equipa' ? null : t)} />
                    <span>
                      <span className="block text-sm font-semibold">{TEMPLATE_LABEL[t]}</span>
                      <span className="block text-xs text-ink-3">{TEMPLATE_HINT[t]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Equipa">{(p) => <Select {...p} value={filters.teamId ?? ''} onChange={(e) => set('equipa', e.target.value || null)}><option value="">Todas</option>{Object.values(db.teams).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}</Field>
            <Field label="Obra">{(p) => <Select {...p} value={filters.siteId ?? ''} onChange={(e) => set('obra', e.target.value || null)}><option value="">Todas</option>{Object.values(db.sites).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</Select>}</Field>
            <Field label="Cliente">{(p) => <Select {...p} value={filters.clientId ?? ''} onChange={(e) => set('cliente', e.target.value || null)}><option value="">Todos</option>{Object.values(db.clients).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
            <Field label="Trabalhador">{(p) => <Select {...p} value={filters.workerId ?? ''} onChange={(e) => set('trabalhador', e.target.value || null)}><option value="">Todos</option>{Object.values(db.workers).sort((a, b) => a.name.localeCompare(b.name)).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>}</Field>
            <WeekNotes key={week} week={week} />
          </aside>

          <section aria-label="Pré-visualização" className="min-w-0">
            <div className="no-print mb-2 flex items-center justify-between">
              <Segmented label="Template" size="sm" value={template} onChange={(v) => set('template', v === 'equipa' ? null : v)} options={(Object.keys(TEMPLATE_LABEL) as MapTemplate[]).map((t) => ({ value: t, label: TEMPLATE_LABEL[t] }))} />
              <span className="text-xs text-ink-3">{map.totals.workers} pessoas · {map.totals.sites} obras · {map.totals.hours} h planeadas</span>
            </div>
            <div className="print-sheet overflow-x-auto rounded-md border border-line bg-white p-6 shadow-e1">
              <div className="mb-4 flex items-end justify-between border-b-2 border-pinho pb-2">
                <div>
                  <p className="text-xs text-ink-3">{db.company.name} · Demonstração · dados fictícios</p>
                  <h2 className="font-expanded text-lg font-semibold">{TEMPLATE_LABEL[template]} · Semana {map.weekNumber}</h2>
                </div>
                <p className="text-sm text-ink-2">{map.label}</p>
              </div>
              {empty ? (
                <p className="py-10 text-center text-sm text-ink-3">
                  {template === 'horas' || template === 'erp' ? 'Não há horas realizadas válidas nesta semana com estes filtros.' : 'Não há planeamento nesta semana com estes filtros.'}
                </p>
              ) : template === 'equipa' ? (
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-left text-xs text-ink-3"><tr><th className="pb-1">Equipa / trabalhadores</th><th className="pb-1">Dias</th><th className="pb-1">Obra</th><th className="pb-1">Trabalho</th><th className="pb-1">Horário</th><th className="pb-1">Viatura</th><th className="pb-1 text-right">Horas</th></tr></thead>
                  {map.groups.map((g) => (
                    <tbody key={g.key} className="border-t border-line">
                      <tr className="bg-cal font-semibold">
                        <td className="border-l-4 py-1.5 pl-2" style={{ borderLeftColor: g.teamColor }}>{g.teamName}</td>
                        <td>{g.dates.map((d) => dayShort(d)).join(', ')}</td>
                        <td><span className="font-mono text-xs">{g.siteCode}</span> {g.siteName}</td>
                        <td className="text-xs font-normal">{g.notes.join(' · ')}</td>
                        <td className="font-mono text-xs">{g.schedule}</td>
                        <td className="font-mono text-xs">{g.vehicles.join(', ')}</td>
                        <td className="text-right tabular">{g.totalHours}</td>
                      </tr>
                      {g.workers.map((w) => (
                        <tr key={w.workerId} className="text-ink-2">
                          <td className="py-0.5 pl-5">{w.name}{w.isForeman && <span className="ml-1 text-xs text-ambar-ink">(resp.)</span>}</td>
                          <td className="text-xs">{Object.keys(w.hoursByDate).sort().map((d) => dayShort(d)).join(', ')}</td>
                          <td colSpan={4} />
                          <td className="text-right tabular">{w.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              ) : template === 'obra' ? (
                <div className="flex flex-col gap-5">
                  {[...new Set(map.groups.map((g) => g.siteId))].map((sid) => {
                    const groups = map.groups.filter((g) => g.siteId === sid)
                    return (
                      <table key={sid} className="w-full min-w-[720px] text-sm">
                        <caption className="bg-pinho px-2 py-1.5 text-left font-semibold text-white">{groups[0]!.siteCode} — {groups[0]!.siteName} <span className="font-normal text-white/70">· {groups[0]!.city}</span></caption>
                        <thead className="text-xs text-ink-3"><tr><th className="text-left">Trabalhador</th><th className="text-left">Equipa</th>{map.days.map((d) => <th key={d} className="text-right">{dayShort(d)} {d.slice(8)}</th>)}<th className="text-right">Total</th></tr></thead>
                        <tbody>
                          {groups.flatMap((g) => g.workers.map((w) => (
                            <tr key={`${g.key}-${w.workerId}`} className="border-t border-line-2">
                              <td className="py-1">{w.name}</td>
                              <td className="text-xs text-ink-3">{g.teamName}</td>
                              {map.days.map((d) => <td key={d} className="text-right font-mono text-xs tabular">{w.hoursByDate[d] ?? ''}</td>)}
                              <td className="text-right font-mono text-xs font-semibold tabular">{w.total}</td>
                            </tr>
                          )))}
                        </tbody>
                      </table>
                    )
                  })}
                </div>
              ) : (
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="text-left text-xs text-ink-3">
                    {template === 'erp' ? (
                      <tr><th>Trabalhador</th><th>Data</th><th className="text-right">Total de horas</th><th>Atividade</th><th>Elemento</th><th>Ordem</th></tr>
                    ) : (
                      <tr><th>N.º</th><th>Trabalhador</th><th>Data</th><th>Obra</th><th className="text-right">Horas</th><th className="text-right">Normais</th><th className="text-right">Extra</th><th>Estado</th></tr>
                    )}
                  </thead>
                  <tbody className="font-mono text-xs">
                    {rows.map((r) =>
                      template === 'erp' ? (
                        <tr key={`${r.workerId}-${r.date}`} className="border-t border-line-2"><td className="py-0.5">{r.workerNumber}</td><td>{dateNumeric(r.date)}</td><td className="text-right">{r.hours}</td><td>{r.activityCode}</td><td>{r.siteCode}</td><td>{r.erpOrder}</td></tr>
                      ) : (
                        <tr key={`${r.workerId}-${r.date}`} className="border-t border-line-2"><td className="py-0.5">{r.workerNumber}</td><td className="font-sans">{r.workerName}</td><td>{dateNumeric(r.date)}</td><td>{r.siteCode}</td><td className="text-right">{r.hours}</td><td className="text-right">{r.normal}</td><td className="text-right">{r.extra || ''}</td><td className="font-sans">{ENTRY_STATUS[r.status as EntryStatus]}</td></tr>
                      ),
                    )}
                  </tbody>
                </table>
              )}
              {template === 'equipa' && map.note && <p className="mt-4 border-t border-line pt-2 text-sm"><strong>Notas gerais da semana:</strong> {map.note}</p>}
              {template === 'erp' && <p className="mt-3 text-xs text-ink-3">Códigos de atividade: {settings.activityCodes.normal} até 8 h, {settings.activityCodes.ate9} até 9 h, {settings.activityCodes.extra} acima disso e fins de semana (configurável nas Definições).</p>}
            </div>
          </section>
        </div>
      </ModuleGuard>
    </div>
  )
}

/** Notas gerais da semana; remonta por semana (key) em vez de sincronizar estado. */
function WeekNotes({ week }: { week: string }) {
  const saved = useDemo((s) => s.db.weekNotes[week]?.text ?? '')
  const setWeekNote = useDemo((s) => s.setWeekNote)
  const [note, setNote] = useState(saved)
  return (
    <Field label="Notas gerais da semana" hint="Aparecem no fim do mapa por equipa. Guardam ao sair do campo.">
      {(p) => (
        <Textarea
          {...p}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (note !== saved) {
              setWeekNote(week, note)
              toast.success('Notas guardadas')
            }
          }}
        />
      )}
    </Field>
  )
}
