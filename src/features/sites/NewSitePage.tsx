import { ArrowLeft, ArrowRight, Building2, Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { availability } from '@/domain/availability'
import { formatHours } from '@/domain/hours'
import { buildIndex } from '@/domain/indexes'
import { COUNTRY_NAME } from '@/domain/labels'
import { workdaysBetween } from '@/domain/planning'
import type { Country, ID } from '@/domain/types'
import { addDays, dateShort } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Badge, Plate } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Field, Input, Segmented, Select, Switch, Textarea } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { SiteMap } from '../shared/SiteMap'

const STEPS = ['Obra e cliente', 'Localização', 'Prazos e horas', 'Equipa e viatura', 'Confirmar'] as const

const CITY_PRESETS: Record<Country, { city: string; lat: number; lng: number }[]> = {
  PT: [{ city: 'Porto', lat: 41.1579, lng: -8.6291 }, { city: 'Maia', lat: 41.2357, lng: -8.62 }, { city: 'Lisboa', lat: 38.7223, lng: -9.1393 }, { city: 'Coimbra', lat: 40.2033, lng: -8.4103 }],
  FR: [{ city: 'Lyon', lat: 45.764, lng: 4.8357 }, { city: 'Paris', lat: 48.8566, lng: 2.3522 }, { city: 'Bordéus', lat: 44.8378, lng: -0.5792 }],
  BE: [{ city: 'Bruxelas', lat: 50.8503, lng: 4.3517 }, { city: 'Antuérpia', lat: 51.2194, lng: 4.4025 }],
  DE: [{ city: 'Munique', lat: 48.1351, lng: 11.582 }, { city: 'Estugarda', lat: 48.7758, lng: 9.1829 }],
}

/** Fluxo 1 — criar obra: cliente e localização → limite de horas → equipa → viatura → confirmar. */
export function NewSitePage() {
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const createSite = useDemo((s) => s.createSite)
  const undo = useDemo((s) => s.undo)
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [clientMode, setClientMode] = useState<'existente' | 'novo'>('novo')
  const [clientId, setClientId] = useState<ID>('')
  const [client, setClient] = useState({ name: '', contactName: '', email: '', country: 'PT' as Country })
  const [country, setCountry] = useState<Country>('PT')
  const [city, setCity] = useState('Maia')
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: 41.2357, lng: -8.62 })
  const [start, setStart] = useState(addDays(today, 3))
  const [end, setEnd] = useState(addDays(today, 240))
  const [limit, setLimit] = useState('3500')
  const [directorId, setDirectorId] = useState('m1')
  const [teamId, setTeamId] = useState<ID>('')
  const [moveTeam, setMoveTeam] = useState(true)
  const [planWeeks, setPlanWeeks] = useState(2)
  const [vehicleId, setVehicleId] = useState<ID>('')
  const team = teamId ? db.teams[teamId] : undefined

  const from = start > today ? start : today
  const to = addDays(from, planWeeks * 7 - 1)
  const idx = buildIndex(db)
  const teamImpact = useMemo(() => {
    if (!team) return null
    const days = workdaysBetween(from, to)
    const moved = Object.values(db.assignments).filter((a) => team.memberIds.includes(a.workerId) && a.date >= from && a.date <= to)
    const sites = [...new Set(moved.map((a) => a.siteId))].map((sid) => db.sites[sid]?.code).filter(Boolean)
    const absent = team.memberIds.reduce((s, m) => s + days.filter((d) => availability(db.workers[m]!, d, idx).state === 'ausente').length, 0)
    return { days: days.length, moved: moved.length, sites, absent }
  }, [team, db, from, to, idx])
  const vehicle = vehicleId ? db.vehicles[vehicleId] : team?.vehicleId ? db.vehicles[team.vehicleId] : undefined
  const seatsShort = team && vehicle && vehicle.seats < team.memberIds.length

  const valid = [
    !!name.trim() && (clientMode === 'existente' ? !!clientId : !!client.name.trim()),
    !!city.trim(),
    !!start && end > start && (limit === '' || Number(limit) > 0),
    true,
    true,
  ][step]!

  const create = () => {
    const id = createSite({
      name,
      description: description || 'Obra criada na demonstração.',
      ...(clientMode === 'existente' ? { clientId } : { newClient: { ...client, country } }),
      country,
      city,
      address: address || `${city}, ${COUNTRY_NAME[country]}`,
      lat: coords.lat,
      lng: coords.lng,
      hourLimit: limit === '' ? null : Number(limit),
      startDate: start,
      endDate: end,
      directorId,
      teamId: teamId || null,
      vehicleId: vehicleId || null,
      planWeeks,
      moveTeam,
    })
    toast.success(`Obra ${name} criada`, {
      description: team ? `${team.name} planeada de ${dateShort(from)} a ${dateShort(to)}. Dashboard e planeamento atualizados.` : 'Associe uma equipa quando a obra arrancar.',
      action: { label: 'Anular', onClick: () => { undo(); navigate('/obras') } },
    })
    navigate(`/obras/${id}`)
  }

  return (
    <div className="mx-auto max-w-[920px]">
      <Link to="/obras" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Obras
      </Link>
      <PageHeader eyebrow={`Nova obra · passo ${step + 1} de ${STEPS.length}`} title={STEPS[step]} />
      <ol className="mb-5 grid grid-cols-5 gap-1.5" aria-label="Passos">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined}>
            <button type="button" disabled={i > step} onClick={() => setStep(i)} className="flex w-full flex-col gap-1 text-left disabled:cursor-default">
              <span className={cn('h-1 rounded-full', i <= step ? 'bg-pinho' : 'bg-line')} />
              <span className={cn('hidden text-xs sm:block', i === step ? 'font-semibold' : 'text-ink-3')}>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <Panel>
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da obra" className="sm:col-span-2">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Armazém Maia Norte" autoFocus />}</Field>
            <Field label="Descrição" optional className="sm:col-span-2">{(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tipo de obra, dimensão, particularidades" />}</Field>
            <div className="sm:col-span-2">
              <Segmented label="Cliente" value={clientMode} onChange={setClientMode} options={[{ value: 'novo', label: 'Cliente novo' }, { value: 'existente', label: 'Cliente existente' }]} />
            </div>
            {clientMode === 'existente' ? (
              <Field label="Cliente" className="sm:col-span-2">
                {(p) => (
                  <Select {...p} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                    <option value="">Escolher…</option>
                    {Object.values(db.clients).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                )}
              </Field>
            ) : (
              <>
                <Field label="Nome do cliente" className="sm:col-span-2">{(p) => <Input {...p} value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />}</Field>
                <Field label="Pessoa de contacto">{(p) => <Input {...p} value={client.contactName} onChange={(e) => setClient({ ...client, contactName: e.target.value })} />}</Field>
                <Field label="Email" optional>{(p) => <Input {...p} type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} />}</Field>
              </>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <div className="flex flex-col gap-4">
              <Field label="País">
                {(p) => (
                  <Select {...p} value={country} onChange={(e) => { const c = e.target.value as Country; setCountry(c); const first = CITY_PRESETS[c][0]!; setCity(first.city); setCoords({ lat: first.lat, lng: first.lng }) }}>
                    {Object.entries(COUNTRY_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Cidade" hint="Escolha uma sugestão ou escreva.">
                {(p) => <Input {...p} value={city} onChange={(e) => setCity(e.target.value)} list="cities" />}
              </Field>
              <datalist id="cities">{CITY_PRESETS[country].map((c) => <option key={c.city} value={c.city} />)}</datalist>
              <div className="flex flex-wrap gap-1.5">
                {CITY_PRESETS[country].map((c) => (
                  <Button key={c.city} size="sm" variant={city === c.city ? 'primary' : 'secondary'} onClick={() => { setCity(c.city); setCoords({ lat: c.lat, lng: c.lng }) }}>{c.city}</Button>
                ))}
              </div>
              <Field label="Morada" optional>{(p) => <Input {...p} value={address} onChange={(e) => setAddress(e.target.value)} />}</Field>
              <p className="font-mono text-xs text-ink-3">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>
              {country !== 'PT' && <p className="rounded-md bg-aco-soft px-3 py-2 text-xs text-aco-ink">Obra no estrangeiro: o Andaime passa a exigir os documentos de destacamento de {COUNTRY_NAME[country]} a quem for planeado nela.</p>}
            </div>
            <div>
              <SiteMap pins={Object.values(db.sites).map((x) => ({ site: x }))} onPick={(lat, lng) => setCoords({ lat, lng })} picked={coords} className="h-80" label="Clique no mapa para marcar a localização" />
              <p className="mt-1.5 text-xs text-ink-3">Clique no mapa para afinar a localização.</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Início">{(p) => <Input {...p} type="date" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
            <Field label="Fim previsto" error={end <= start ? 'O fim tem de ser depois do início.' : null}>{(p) => <Input {...p} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
            <Field label="Limite de horas" hint="Horas contratadas ou o máximo definido. Alerta aos 85 % da projeção." className="sm:col-span-1">
              {(p) => <Input {...p} type="number" min={0} step={100} value={limit} onChange={(e) => setLimit(e.target.value)} />}
            </Field>
            <Field label="Diretor de obra">
              {(p) => (
                <Select {...p} value={directorId} onChange={(e) => setDirectorId(e.target.value)}>
                  {Object.values(db.managers).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              )}
            </Field>
            <p className="text-sm text-ink-3 sm:col-span-2">
              {start > today ? 'Fica como planeada até à data de início.' : 'Começa hoje: fica logo em curso.'}
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Equipa</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <label className={cn('flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2', !teamId ? 'border-pinho bg-lima-soft/50' : 'border-line')}>
                  <input type="radio" name="team" className="accent-pinho" checked={!teamId} onChange={() => setTeamId('')} />
                  <span className="text-sm">Sem equipa por agora</span>
                </label>
                {Object.values(db.teams).map((t) => (
                  <label key={t.id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2', teamId === t.id ? 'border-pinho bg-lima-soft/50' : 'border-line hover:border-ink-4')}>
                    <input type="radio" name="team" className="accent-pinho" checked={teamId === t.id} onChange={() => { setTeamId(t.id); setVehicleId('') }} />
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: t.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{t.name}</span>
                      <span className="block text-xs text-ink-3">{t.memberIds.length} elementos · agora em {db.sites[t.siteId ?? '']?.code ?? '—'}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {team && teamImpact && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Planear as próximas">
                    {(p) => (
                      <Select {...p} value={planWeeks} onChange={(e) => setPlanWeeks(Number(e.target.value))}>
                        {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'semana' : 'semanas'}</option>)}
                      </Select>
                    )}
                  </Field>
                  <Field label="Viatura" hint={vehicle ? `${vehicle.seats} lugares para ${team.memberIds.length} pessoas` : undefined} error={seatsShort ? 'A viatura não tem lugares suficientes para a equipa.' : null}>
                    {(p) => (
                      <Select {...p} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                        <option value="">Manter a da equipa ({db.vehicles[team.vehicleId ?? '']?.plate ?? 'nenhuma'})</option>
                        {Object.values(db.vehicles).filter((v) => v.id !== team.vehicleId).map((v) => (
                          <option key={v.id} value={v.id} disabled={v.status !== 'operacional'}>
                            {v.plate} · {v.seats} lugares{v.teamId ? ` · com ${db.teams[v.teamId]?.name}` : ' · livre'}{v.status !== 'operacional' ? ' · indisponível' : ''}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
                <Switch label="Retirar a equipa das outras obras neste período" description={`${teamImpact.moved} atribuições ${teamImpact.sites.length ? `em ${teamImpact.sites.join(', ')}` : ''} serão substituídas. Desligado: as duas ficam planeadas e o Andaime mostra os conflitos.`} checked={moveTeam} onChange={setMoveTeam} />
                {db.vehicles[team.vehicleId ?? '']?.inspectionUntil && db.vehicles[team.vehicleId ?? '']!.inspectionUntil < from && !vehicleId && (
                  <p className="rounded-md border border-tijolo/30 bg-tijolo-soft px-3 py-2 text-sm text-tijolo-ink">
                    A viatura habitual desta equipa ({db.vehicles[team.vehicleId!]?.plate}) tem a inspeção caducada. Escolha uma alternativa.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div><dt className="text-xs text-ink-3">Obra</dt><dd className="font-semibold">{name}</dd></div>
              <div><dt className="text-xs text-ink-3">Cliente</dt><dd>{clientMode === 'existente' ? db.clients[clientId]?.name : client.name}</dd></div>
              <div><dt className="text-xs text-ink-3">Local</dt><dd>{city}, {COUNTRY_NAME[country]}</dd></div>
              <div><dt className="text-xs text-ink-3">Prazo</dt><dd>{dateShort(start)} a {dateShort(end)}</dd></div>
              <div><dt className="text-xs text-ink-3">Limite de horas</dt><dd>{limit ? formatHours(Number(limit)) : 'Sem limite'}</dd></div>
              <div><dt className="text-xs text-ink-3">Equipa</dt><dd>{team?.name ?? 'Sem equipa'}</dd></div>
              {vehicle && team && <div><dt className="text-xs text-ink-3">Viatura</dt><dd><Plate plate={vehicle.plate} /></dd></div>}
            </dl>
            <div className="rounded-md bg-cal p-3 text-sm">
              <p className="mb-1.5 font-semibold">Ao confirmar</p>
              <ul className="flex flex-col gap-1 text-ink-2">
                <li className="flex gap-2"><Check className="mt-0.5 size-4 text-ok" aria-hidden /> A obra aparece em Obras, no mapa e no centro de operações.</li>
                {team && teamImpact && <li className="flex gap-2"><Check className="mt-0.5 size-4 text-ok" aria-hidden /> {team.name} fica planeada {teamImpact.days} dias úteis ({dateShort(from)}–{dateShort(to)}){teamImpact.absent ? `, exceto ${teamImpact.absent} dias de ausência` : ''}.</li>}
                {team && moveTeam && teamImpact?.moved ? <li className="flex gap-2"><Check className="mt-0.5 size-4 text-ok" aria-hidden /> Saem {teamImpact.moved} atribuições de {teamImpact.sites.join(', ')}.</li> : null}
                {limit && <li className="flex gap-2"><Check className="mt-0.5 size-4 text-ok" aria-hidden /> O consumo de horas começa a ser medido face a {formatHours(Number(limit))}.</li>}
              </ul>
            </div>
            {seatsShort && <Badge tone="warn" dot>A viatura tem menos lugares do que a equipa: vai aparecer um conflito de lotação.</Badge>}
          </div>
        )}

        <div className="mt-6 flex justify-between gap-2 border-t border-line-2 pt-4">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} disabled={step === 0} onClick={() => setStep(step - 1)}>Voltar</Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" iconRight={<ArrowRight className="size-4" />} disabled={!valid} onClick={() => setStep(step + 1)}>Continuar</Button>
          ) : (
            <Button variant="primary" icon={<Building2 className="size-4" />} onClick={create} data-tour="confirm-site">Criar obra</Button>
          )}
        </div>
      </Panel>
    </div>
  )
}
