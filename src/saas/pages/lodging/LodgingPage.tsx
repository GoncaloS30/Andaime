import { BedDouble, ChevronLeft, ChevronRight, MapPin, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Avatar } from '@/ui/Avatar'
import { Badge, SiteCode } from '@/ui/Badge'
import { Button, IconButton } from '@/ui/Button'
import { Checkbox, Input, Select } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import { errorMessage } from '../../api/http'
import { nightsBetween, nightsLabel, useLodgingWeek, useRemoveStay, useSaveStay, type BoardLine, type Stay } from '../../api/lodging'
import { mondayOf } from '../../api/planning'
import { addDaysIso, formatDate, todayIso } from '../../api/workforce'
import { useActiveOrg } from '../../session'

const DAY = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: '2-digit', timeZone: 'UTC' })
const dayShort = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`)).replace('.', '')
const dateShort = (iso: string) => formatDate(iso).slice(0, 5)

/** Dormidas da semana: quem dorme fora, onde e quando. A aplicação propõe a partir da escala; quem marca decide. */
export function LodgingPage() {
  const org = useActiveOrg()
  const [search, setSearch] = useSearchParams()
  const thisWeek = mondayOf(todayIso())
  const week = mondayOf(search.get('semana') || thisWeek)
  const board = useLodgingWeek(org.id, week)
  const [onlyAway, setOnlyAway] = useState(true)

  const setWeek = (value: string | null) =>
    setSearch(
      (current) => {
        const next = new URLSearchParams(current)
        if (value && value !== thisWeek) next.set('semana', value)
        else next.delete('semana')
        return next
      },
      { replace: true },
    )

  const lines = (board.data?.lines ?? []).filter((l) => !onlyAway || l.away !== 'NEAR' || l.stay)
  const summary = board.data?.summary

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        eyebrow={org.name}
        title="Dormidas"
        description={`Semana de ${formatDate(week)} a ${formatDate(addDaysIso(week, 6))}`}
        actions={
          <div className="flex items-center rounded-md border border-line bg-surface">
            <IconButton label="Semana anterior" onClick={() => setWeek(addDaysIso(week, -7))}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <button type="button" onClick={() => setWeek(null)} className="h-9 border-x border-line px-3 text-sm font-medium hover:bg-cal" aria-current={week === thisWeek ? 'date' : undefined}>
              Esta semana
            </button>
            <IconButton label="Semana seguinte" onClick={() => setWeek(addDaysIso(week, 7))}>
              <ChevronRight className="size-4" />
            </IconButton>
          </div>
        }
      />

      {board.isPending ? (
        <SkeletonRows rows={6} />
      ) : board.isError ? (
        <ErrorState onRetry={() => void board.refetch()} />
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line-2 sm:grid-cols-4">
            {(
              [
                ['Pessoas fora', summary!.peopleAway, false],
                ['Noites marcadas', summary!.nights, false],
                ['Hotel por definir', summary!.undefinedHotel, true],
                ['Estadias sem escala', summary!.withoutSchedule, true],
              ] as const
            ).map(([label, value, warn]) => (
              <div key={label} className="bg-surface px-4 py-3">
                <dt className="text-xs text-ink-3">{label}</dt>
                <dd className={`font-expanded text-2xl font-semibold tabular ${warn && value > 0 ? 'text-ambar-ink' : ''}`}>{value}</dd>
              </div>
            ))}
          </dl>

          <Panel
            title="Quem está em obra"
            description="Uma linha por pessoa e obra escalada. As datas vêm propostas pela escala; ajuste e marque."
            actions={<Checkbox label="Só longe de casa" checked={onlyAway} onChange={(e) => setOnlyAway(e.target.checked)} className="text-sm" />}
            flush
          >
            {board.data.lines.length === 0 ? (
              <EmptyState
                compact
                icon={<BedDouble />}
                title="Sem escala nesta semana"
                action={
                  <Link to="/planeamento" className="text-sm text-pinho underline">
                    Ir para o planeamento
                  </Link>
                }
              >
                As dormidas partem da escala: planeie a semana primeiro.
              </EmptyState>
            ) : lines.length === 0 ? (
              <EmptyState compact icon={<BedDouble />} title="Ninguém longe de casa nesta semana">
                Desligue o filtro para ver toda a escala.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line-2">
                {lines.map((line) => (
                  <StayLine key={`${line.employeeId}|${line.siteId}|${week}|${line.stay?.version ?? 'novo'}`} line={line} week={week} />
                ))}
              </ul>
            )}
          </Panel>

          {board.data.staysWithoutSchedule.length > 0 && (
            <Panel
              className="mt-4"
              title="Estadias sem escala"
              description="A linha da escala desapareceu ou a pessoa mudou de obra. Não se apagam sozinhas: confirme se a reserva se mantém."
              flush
            >
              <ul className="divide-y divide-line-2">
                {board.data.staysWithoutSchedule.map((s) => (
                  <OrphanLine key={s.id} stay={s} />
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  )
}

function StayLine({ line, week }: { line: BoardLine; week: string }) {
  const org = useActiveOrg()
  const save = useSaveStay(org.id)
  const remove = useRemoveStay(org.id)
  const stay = line.stay
  const [hotelId, setHotelId] = useState(stay ? (stay.hotelId ?? '') : (line.hotels[0]?.id ?? ''))
  const [checkIn, setCheckIn] = useState(stay?.checkIn ?? line.proposedCheckIn)
  const [checkOut, setCheckOut] = useState(stay?.checkOut ?? line.proposedCheckOut)
  const nights = nightsBetween(checkIn, checkOut)
  const validDates = !!checkIn && !!checkOut && checkOut > checkIn
  const dirty = !stay || (stay.hotelId ?? '') !== hotelId || stay.checkIn !== checkIn || stay.checkOut !== checkOut
  // Um hotel entretanto removido continua a aparecer na estadia passada que o guardou.
  const hotels = stay?.hotelId && !line.hotels.some((h) => h.id === stay.hotelId) ? [...line.hotels, { id: stay.hotelId, name: stay.hotelName ?? 'Hotel removido' }] : line.hotels
  const id = `${line.employeeId}-${line.siteId}`

  const submit = () =>
    save.mutate(
      { employeeId: line.employeeId, siteId: line.siteId, week, hotelId: hotelId || null, checkIn, checkOut, notes: stay?.notes ?? null },
      {
        onSuccess: () => toast.success(stay ? 'Estadia atualizada' : 'Estadia marcada', { description: `${line.employeeName} · ${nightsLabel(nights)}. O trabalhador foi avisado.` }),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )

  return (
    <li className="grid gap-3 px-4 py-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_auto_auto] xl:items-center">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={line.employeeName} photo={line.photoUrl} size="md" />
        <span className="min-w-0">
          <Link to={`/trabalhadores/${line.employeeId}`} className="block truncate font-medium hover:underline">
            {line.employeeName}
          </Link>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-3">
            <MapPin className="size-3" aria-hidden /> {line.homeCity || 'Residência não indicada'}
            {line.distanceKm != null && <span>· {line.distanceKm} km</span>}
            {line.away === 'FAR' && <Badge tone="warn">Longe de casa</Badge>}
            {line.away === 'UNKNOWN' && <span>· residência sem localização</span>}
          </span>
        </span>
      </div>
      <div className="min-w-0 text-sm">
        <Link to={`/obras/${line.siteId}`} className="inline-flex items-center gap-1.5 hover:underline" title={line.siteName}>
          <SiteCode code={line.siteCode} color={line.siteColor} />
          <span className="truncate text-ink-2">{line.siteName}</span>
        </Link>
        <span className="mt-0.5 block text-xs text-ink-3">{line.days.map(dayShort).join(' · ')}</span>
      </div>
      <div className="grid grid-cols-[minmax(9rem,1fr)_9.5rem_9.5rem] items-end gap-2 max-sm:grid-cols-2 max-sm:[&>label:first-child]:col-span-2 sm:col-span-2 xl:col-span-1">
        <label className="text-xs text-ink-3" htmlFor={`h-${id}`}>
          Hotel
          <Select id={`h-${id}`} value={hotelId} onChange={(e) => setHotelId(e.target.value)} className="mt-0.5 w-full">
            <option value="">Por definir</option>
            {hotels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-xs text-ink-3" htmlFor={`in-${id}`}>
          Entrada
          <Input id={`in-${id}`} type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="mt-0.5 w-full" />
        </label>
        <label className="text-xs text-ink-3" htmlFor={`out-${id}`}>
          Saída
          <Input
            id={`out-${id}`}
            type="date"
            value={checkOut}
            min={checkIn ? addDaysIso(checkIn, 1) : undefined}
            onChange={(e) => setCheckOut(e.target.value)}
            className="mt-0.5 w-full"
            aria-invalid={!validDates || undefined}
          />
        </label>
      </div>
      <div className="flex items-center justify-end gap-2 sm:col-span-2 xl:col-span-1">
        <span className="text-sm whitespace-nowrap tabular text-ink-2" aria-live="polite">
          {validDates ? nightsLabel(nights) : 'Datas inválidas'}
        </span>
        {dirty && (
          <Button size="sm" variant={stay ? 'secondary' : 'primary'} loading={save.isPending} disabled={!validDates} onClick={submit}>
            {stay ? 'Guardar' : 'Marcar'}
          </Button>
        )}
        {stay && (
          <IconButton
            label={`Remover estadia de ${line.employeeName}`}
            size="sm"
            disabled={remove.isPending}
            onClick={() => remove.mutate(stay.id, { onSuccess: () => toast('Estadia removida'), onError: (e) => toast.error(errorMessage(e)) })}
          >
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </div>
    </li>
  )
}

function OrphanLine({ stay }: { stay: Stay }) {
  const org = useActiveOrg()
  const remove = useRemoveStay(org.id)
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <Avatar name={stay.employeeName} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{stay.employeeName}</span> · <SiteCode code={stay.siteCode} color={stay.siteColor} /> ·{' '}
        {stay.hotelName ?? 'Hotel por definir'}
        <span className="block text-xs text-ink-3">
          {dateShort(stay.checkIn)} → {dateShort(stay.checkOut)} · {nightsLabel(stay.nights)}
          {stay.notes ? ` · ${stay.notes}` : ''}
        </span>
      </span>
      <Button
        size="sm"
        variant="ghost"
        icon={<Trash2 className="size-3.5" />}
        loading={remove.isPending}
        onClick={() => remove.mutate(stay.id, { onSuccess: () => toast('Estadia removida'), onError: (e) => toast.error(errorMessage(e)) })}
      >
        Remover
      </Button>
    </li>
  )
}
