import { BedDouble, ChevronLeft, ChevronRight, MapPin, Sheet, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { ModuleGuard } from '@/app/ModuleGuard'
import { nightsBetween, stayBoard, staySummary, type StayRow } from '@/domain/stays'
import type { Stay } from '@/domain/types'
import { addDays, dateShort, dayShort, isoWeek, weekLabel, weekStart } from '@/domain/weeks'
import { downloadXLSX } from '@/lib/exportTable'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { Badge, SiteCode } from '@/ui/Badge'
import { Button, IconButton } from '@/ui/Button'
import { Input, Select } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { EmptyState } from '@/ui/States'

/** Dormidas da semana: quem dorme fora, onde e quando. A app propõe a partir da escala; quem marca decide. */
export function LodgingPage() {
  const [sp, setSp] = useSearchParams()
  const today = useDemo((s) => s.session.today)
  const week = sp.get('semana') ?? weekStart(today)
  const setWeek = (w: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (w) n.set('semana', w); else n.delete('semana'); return n }, { replace: true })
  const d = useDerived(({ db }) => {
    const board = stayBoard(db, week)
    return { db, board, sum: staySummary(db, week, board) }
  }, [week])
  const [onlyAway, setOnlyAway] = useState(true)
  const rows = d.board.filter((r) => !onlyAway || r.away !== 'perto' || r.stay)

  const exportWeek = () => {
    const stays = Object.values(d.db.stays).filter((s) => s.week === week)
    void downloadXLSX(
      `dormidas-semana-${isoWeek(week)}`,
      `Dormidas semana ${isoWeek(week)}`,
      [
        { key: 'nome', label: 'Trabalhador' },
        { key: 'obra', label: 'Obra' },
        { key: 'hotel', label: 'Hotel' },
        { key: 'entrada', label: 'Entrada' },
        { key: 'saida', label: 'Saída' },
        { key: 'noites', label: 'Noites' },
        { key: 'notas', label: 'Notas' },
      ],
      stays.map((s) => ({
        nome: d.db.workers[s.workerId]?.name,
        obra: d.db.sites[s.siteId]?.code,
        hotel: s.hotelId ? d.db.hotels[s.hotelId]?.name : 'Por definir',
        entrada: s.checkIn,
        saida: s.checkOut,
        noites: nightsBetween(s.checkIn, s.checkOut),
        notas: s.notes,
      })),
    ).then(() => toast.success('Dormidas exportadas para Excel'))
  }

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title="Dormidas"
        description={weekLabel(week)}
        actions={
          <>
            <div className="flex items-center rounded-md border border-line bg-surface">
              <IconButton label="Semana anterior" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft className="size-4" /></IconButton>
              <button type="button" onClick={() => setWeek(null)} className="h-9 border-x border-line px-3 text-sm font-medium hover:bg-cal">Esta semana</button>
              <IconButton label="Semana seguinte" onClick={() => setWeek(addDays(week, 7))}><ChevronRight className="size-4" /></IconButton>
            </div>
            <Button icon={<Sheet className="size-4" />} onClick={exportWeek}>Excel</Button>
          </>
        }
      />
      <ModuleGuard empty={{ icon: <BedDouble />, title: 'Sem escala nesta semana', text: 'As dormidas partem da escala: crie a escala da semana primeiro.' }}>
        <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line-2 sm:grid-cols-4">
          {[
            ['Pessoas fora', d.sum.away],
            ['Noites marcadas', d.sum.nights],
            ['Hotel por definir', d.sum.undecided],
            ['Estadias sem escala', d.sum.orphans.length],
          ].map(([label, v], i) => (
            <div key={label} className="bg-surface px-4 py-3">
              <dt className="text-xs text-ink-3">{label}</dt>
              <dd className={`font-expanded text-2xl font-semibold tabular ${i >= 2 && Number(v) > 0 ? 'text-ambar-ink' : ''}`}>{v}</dd>
            </div>
          ))}
        </dl>

        <Panel
          title="Quem está em obra"
          description="Uma linha por pessoa e obra escalada. As datas vêm propostas pela escala; ajuste e marque."
          actions={
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyAway} onChange={(e) => setOnlyAway(e.target.checked)} className="size-4 accent-pinho" />
              Só longe de casa
            </label>
          }
          flush
        >
          {rows.length === 0 ? (
            <EmptyState compact icon={<BedDouble />} title="Ninguém longe de casa nesta semana">Desligue o filtro para ver toda a escala.</EmptyState>
          ) : (
            <ul className="divide-y divide-line-2">
              {rows.map((r) => <StayLine key={`${r.workerId}|${r.siteId}`} row={r} week={week} />)}
            </ul>
          )}
        </Panel>

        {d.sum.orphans.length > 0 && (
          <Panel className="mt-4" title="Estadias sem escala" description="A linha da escala desapareceu ou a pessoa mudou de obra. Não se apagam sozinhas: confirme se a reserva se mantém." flush>
            <ul className="divide-y divide-line-2">
              {d.sum.orphans.map((s) => <OrphanLine key={s.id} stay={s} />)}
            </ul>
          </Panel>
        )}
      </ModuleGuard>
    </div>
  )
}

function StayLine({ row, week }: { row: StayRow; week: string }) {
  const db = useDemo((s) => s.db)
  const mark = useDemo((s) => s.markStay)
  const remove = useDemo((s) => s.removeStay)
  const undo = useDemo((s) => s.undo)
  const w = db.workers[row.workerId]!
  const site = db.sites[row.siteId]!
  const [hotelId, setHotelId] = useState<string>(row.stay ? (row.stay.hotelId ?? '') : (row.hotels[0]?.id ?? ''))
  const [checkIn, setCheckIn] = useState(row.stay?.checkIn ?? row.proposed.checkIn)
  const [checkOut, setCheckOut] = useState(row.stay?.checkOut ?? row.proposed.checkOut)
  const nights = nightsBetween(checkIn, checkOut)
  const dirty = !row.stay || row.stay.hotelId !== (hotelId || null) || row.stay.checkIn !== checkIn || row.stay.checkOut !== checkOut
  const save = () => {
    try {
      mark({ workerId: w.id, siteId: site.id, week, hotelId: hotelId || null, checkIn, checkOut, notes: row.stay?.notes ?? '' })
      toast.success(row.stay ? 'Estadia atualizada' : 'Estadia marcada', { description: `${w.name} · ${nights === 1 ? '1 noite' : `${nights} noites`}. O trabalhador foi notificado.`, action: { label: 'Anular', onClick: () => undo() } })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível marcar a estadia.')
    }
  }
  const id = `${w.id}-${site.id}`
  return (
    <li className="grid gap-3 px-4 py-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_auto_auto] xl:items-center">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={w.name} photo={w.photo} size="md" color={db.teams[w.teamId ?? '']?.color} />
        <span className="min-w-0">
          <span className="block truncate font-medium">{w.name}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-3">
            <MapPin className="size-3" aria-hidden /> {w.homeCity}
            {row.away === 'longe' && <Badge tone="warn">Longe de casa</Badge>}
            {row.away === 'desconhecido' && <span>· residência sem localização</span>}
          </span>
        </span>
      </div>
      <div className="min-w-0 text-sm">
        <SiteCode code={site.code} color={site.color} />
        <span className="mt-0.5 block text-xs text-ink-3">{row.days.map((x) => dayShort(x)).join(' · ')}</span>
      </div>
      <div className="grid grid-cols-[minmax(9rem,1fr)_9.5rem_9.5rem] items-end gap-2 max-sm:grid-cols-2 max-sm:[&>label:first-child]:col-span-2 sm:col-span-2 xl:col-span-1">
        <label className="text-xs text-ink-3" htmlFor={`h-${id}`}>
          Hotel
          <Select id={`h-${id}`} value={hotelId} onChange={(e) => setHotelId(e.target.value)} className="mt-0.5 w-full">
            <option value="">Por definir</option>
            {row.hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
        </label>
        <label className="text-xs text-ink-3" htmlFor={`in-${id}`}>
          Entrada
          <Input id={`in-${id}`} type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="mt-0.5 w-full" />
        </label>
        <label className="text-xs text-ink-3" htmlFor={`out-${id}`}>
          Saída
          <Input id={`out-${id}`} type="date" value={checkOut} min={addDays(checkIn, 1)} onChange={(e) => setCheckOut(e.target.value)} className="mt-0.5 w-full" />
        </label>
      </div>
      <div className="flex items-center justify-end gap-2 sm:col-span-2 xl:col-span-1">
        <span className="text-sm whitespace-nowrap tabular text-ink-2">{nights === 1 ? '1 noite' : `${nights} noites`}</span>
        {(dirty || !row.stay) && <Button size="sm" variant={row.stay ? 'secondary' : 'primary'} onClick={save}>{row.stay ? 'Guardar' : 'Marcar'}</Button>}
        {row.stay && (
          <IconButton label={`Remover estadia de ${w.name}`} size="sm" onClick={() => { remove(row.stay!.id); toast('Estadia removida', { action: { label: 'Anular', onClick: () => undo() } }) }}>
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </div>
    </li>
  )
}

function OrphanLine({ stay }: { stay: Stay }) {
  const db = useDemo((s) => s.db)
  const remove = useDemo((s) => s.removeStay)
  const undo = useDemo((s) => s.undo)
  const w = db.workers[stay.workerId]
  const site = db.sites[stay.siteId]
  const n = nightsBetween(stay.checkIn, stay.checkOut)
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <Avatar name={w?.name ?? '?'} photo={w?.photo} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{w?.name}</span> · {site && <SiteCode code={site.code} color={site.color} />} · {stay.hotelId ? db.hotels[stay.hotelId]?.name : 'Hotel por definir'}
        <span className="block text-xs text-ink-3">{dateShort(stay.checkIn)} → {dateShort(stay.checkOut)} · {n === 1 ? '1 noite' : `${n} noites`}{stay.notes ? ` · ${stay.notes}` : ''}</span>
      </span>
      <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => { remove(stay.id); toast('Estadia removida', { action: { label: 'Anular', onClick: () => undo() } }) }}>Remover</Button>
    </li>
  )
}
