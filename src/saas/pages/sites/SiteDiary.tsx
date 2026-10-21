import { BookOpen, Camera, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, ImagePlus, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/cn'
import { Button, IconButton } from '@/ui/Button'
import { Field, Input, Textarea } from '@/ui/Field'
import { Menu } from '@/ui/Menu'
import { Dialog } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'
import {
  authorRoleLabel,
  exportDiary,
  MAX_DIARY_PHOTOS,
  monthLabel,
  shrinkPhoto,
  useDeleteDiaryEntry,
  useDiary,
  useSaveDiaryEntry,
  type DiaryEntry,
  type DiaryPhoto,
} from '../../api/diary'
import { errorMessage, isApiError } from '../../api/http'
import { todayIso } from '../../api/workforce'
import { useActiveOrg } from '../../session'

const THUMBS = 4
const weekday = new Intl.DateTimeFormat('pt-PT', { weekday: 'short' })
const monthShort = new Intl.DateTimeFormat('pt-PT', { month: 'short' })
const time = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' })
const longDate = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const localDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}
const photosLabel = (n: number) => (n === 1 ? '1 foto' : `${n} fotos`)

/** Pesquisa só depois de a pessoa parar de escrever. */
function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

interface SiteDiaryProps {
  siteId: string
  siteLabel: string
  /** Telemóvel do encarregado: botão de câmara direta no formulário. */
  camera?: boolean
}

/** Diário de obra: linha do tempo por dia, atalhos por mês, pesquisa sem acentos, galeria e exportações Word e Excel. */
export function SiteDiary({ siteId, siteLabel, camera }: SiteDiaryProps) {
  const org = useActiveOrg()
  const [month, setMonth] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const q = useDebounced(query)
  const diary = useDiary(org.id, siteId, { month, q })
  const remove = useDeleteDiaryEntry(org.id, siteId)
  const [editing, setEditing] = useState<DiaryEntry | 'novo' | null>(null)
  const [deleting, setDeleting] = useState<DiaryEntry | null>(null)
  const [gallery, setGallery] = useState<{ photos: DiaryPhoto[]; title: string; index: number } | null>(null)
  const [exporting, setExporting] = useState<'docx' | 'xlsx' | null>(null)

  const entries = useMemo(() => diary.data?.entries ?? [], [diary.data])
  const days = useMemo(() => {
    const m = new Map<string, DiaryEntry[]>()
    for (const e of entries) m.set(e.date, [...(m.get(e.date) ?? []), e])
    return [...m.entries()]
  }, [entries])
  const months = diary.data?.months ?? []
  const allCount = months.reduce((sum, m) => sum + m.count, 0)
  const canWrite = diary.data?.canWrite ?? false
  const filtered = !!month || !!q.trim()

  const doExport = async (kind: 'docx' | 'xlsx') => {
    setExporting(kind)
    try {
      await exportDiary(org.id, siteId, kind, { month, q })
      toast.success(kind === 'docx' ? 'Diário exportado para Word' : 'Diário exportado para Excel', {
        description: `${diary.data?.total ?? 0} ${diary.data?.total === 1 ? 'registo' : 'registos'} · ${month ? monthLabel(month) : 'todos os meses'}`,
      })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setExporting(null)
    }
  }

  return (
    <section aria-label={`Diário de obra de ${siteLabel}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
          <label className="sr-only" htmlFor={`diario-q-${siteId}`}>
            Procurar no diário
          </label>
          <Input id={`diario-q-${siteId}`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar (ex.: betonagem)" className="pl-8" />
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button size="sm" icon={<FileText className="size-3.5" />} loading={exporting === 'docx'} disabled={!entries.length} onClick={() => void doExport('docx')}>
            Word
          </Button>
          <Button size="sm" icon={<FileSpreadsheet className="size-3.5" />} loading={exporting === 'xlsx'} disabled={!entries.length} onClick={() => void doExport('xlsx')}>
            Excel
          </Button>
          {canWrite && (
            <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing('novo')}>
              Novo registo
            </Button>
          )}
        </div>
      </div>

      {months.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mês">
          {[{ month: null as string | null, count: allCount }, ...months].map((m) => (
            <button
              key={m.month ?? 'todos'}
              type="button"
              aria-pressed={month === m.month}
              onClick={() => setMonth(m.month)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-pinho focus-visible:outline-none',
                month === m.month ? 'border-pinho bg-pinho text-white' : 'border-line bg-surface text-ink-2 hover:border-ink-4',
              )}
            >
              {m.month ? monthLabel(m.month) : 'Todos'} <span className="tabular opacity-75">{m.count}</span>
            </button>
          ))}
        </div>
      )}

      {diary.isPending ? (
        <SkeletonRows rows={4} />
      ) : diary.isError ? (
        <ErrorState onRetry={() => void diary.refetch()} />
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          {!filtered ? (
            <EmptyState
              icon={<BookOpen />}
              title="Comece o diário desta obra"
              action={
                canWrite ? (
                  <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('novo')}>
                    Novo registo
                  </Button>
                ) : undefined
              }
            >
              Um registo por dia com o que se fez e as fotos que se tiraram. Fica a linha do tempo da obra.
            </EmptyState>
          ) : (
            <EmptyState icon={<Search />} title="Nenhum registo encontrado">
              Experimente outra palavra ou escolha outro mês.
            </EmptyState>
          )}
        </div>
      ) : (
        <>
          <p className="sr-only" role="status">
            {diary.data.total} {diary.data.total === 1 ? 'registo' : 'registos'}
          </p>
          <ol className="flex flex-col">
            {days.map(([date, items]) => (
              <li key={date} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3">
                <div className="flex flex-col items-center pt-1 text-center" aria-hidden>
                  <span className="font-mono text-[11px] font-semibold text-ink-3 uppercase">{weekday.format(localDate(date)).replace('.', '')}</span>
                  <span className="font-expanded text-xl leading-none font-semibold tabular">{Number(date.slice(8))}</span>
                  <span className="text-[11px] text-ink-3">{monthShort.format(localDate(date)).replace('.', '')}</span>
                  <span className="mt-1 w-px flex-1 bg-line" />
                </div>
                <div className="flex flex-col gap-3 pb-5">
                  <h3 className="sr-only">{longDate.format(localDate(date))}</h3>
                  {items.map((e) => (
                    <article key={e.id} className="rounded-lg border border-line bg-surface p-3" aria-labelledby={`diario-${e.id}`}>
                      <header className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 id={`diario-${e.id}`} className="font-semibold break-words text-ink">
                            {e.title}
                          </h4>
                          <p className="text-xs text-ink-3">
                            {e.author.name} · {authorRoleLabel(e.author.role)} · {time.format(new Date(e.createdAt))}
                            {e.photos.length > 0 && ` · ${photosLabel(e.photos.length)}`}
                          </p>
                        </div>
                        {e.canEdit && (
                          <Menu
                            trigger={
                              <IconButton label={`Ações do registo ${e.title}`} size="sm">
                                <MoreHorizontal className="size-4" />
                              </IconButton>
                            }
                            items={[
                              { label: 'Editar', icon: <Pencil className="size-3.5" />, onSelect: () => setEditing(e) },
                              { label: 'Apagar', icon: <Trash2 className="size-3.5" />, danger: true, onSelect: () => setDeleting(e) },
                            ]}
                          />
                        )}
                      </header>
                      {e.body && <p className="mt-1.5 text-sm break-words whitespace-pre-line text-ink-2">{e.body}</p>}
                      {e.photos.length > 0 && (
                        <ul className="mt-2.5 flex flex-wrap gap-1.5">
                          {e.photos.slice(0, THUMBS).map((p, i) => {
                            const more = i === THUMBS - 1 && e.photos.length > THUMBS ? e.photos.length - THUMBS : 0
                            return (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  onClick={() => setGallery({ photos: e.photos, title: e.title, index: i })}
                                  aria-label={more ? `Ver as ${e.photos.length} fotos de ${e.title}` : `Ver foto ${i + 1} de ${e.title}`}
                                  className="relative block aspect-[4/3] w-24 overflow-hidden rounded-sm bg-line-2 focus-visible:ring-2 focus-visible:ring-pinho focus-visible:outline-none sm:w-28"
                                >
                                  <img src={p.url} alt="" loading="lazy" className="size-full object-cover" />
                                  {more > 0 && <span className="absolute inset-0 flex items-center justify-center bg-pinho/80 text-sm font-semibold text-lima">+{more}</span>}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          {diary.data.truncated && <p className="text-xs text-ink-3">Mostram-se os {entries.length} registos mais recentes. Escolha um mês para ver os anteriores.</p>}
        </>
      )}

      {editing && <DiaryEntryDialog siteId={siteId} siteLabel={siteLabel} entry={editing === 'novo' ? null : editing} camera={camera} onClose={() => setEditing(null)} />}
      {deleting && (
        <Dialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          size="sm"
          title="Apagar registo do diário?"
          description={`«${deleting.title}»${deleting.photos.length ? ` e ${photosLabel(deleting.photos.length)}` : ''}. Não é possível anular.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(deleting.id, {
                    onSuccess: () => (toast.success('Registo apagado'), setDeleting(null)),
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              >
                Apagar registo
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-2">O registo e as fotos deixam de aparecer no diário e nas exportações.</p>
        </Dialog>
      )}
      <PhotoGallery photos={gallery?.photos ?? []} index={gallery?.index ?? null} title={gallery?.title ?? ''} onIndex={(i) => setGallery(i === null || !gallery ? null : { ...gallery, index: i })} />
    </section>
  )
}

/** Galeria em diálogo: setas (botões e teclado), contador; Esc fecha e o foco volta a quem a abriu (Radix). */
export function PhotoGallery({ photos, index, onIndex, title }: { photos: DiaryPhoto[]; index: number | null; onIndex: (i: number | null) => void; title: string }) {
  const open = index !== null && photos.length > 0
  const i = Math.min(index ?? 0, Math.max(photos.length - 1, 0))
  const go = (d: number) => onIndex((i + d + photos.length) % photos.length)
  const photo = photos[i]
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onIndex(null)} size="xl" title={title} description={`Foto ${i + 1} de ${photos.length}`}>
      <div
        className="flex items-center gap-2"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            go(1)
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            go(-1)
          }
        }}
      >
        {photos.length > 1 && (
          <IconButton label="Foto anterior" onClick={() => go(-1)}>
            <ChevronLeft className="size-5" />
          </IconButton>
        )}
        <div className="flex min-w-0 flex-1 justify-center">
          {open && photo && (
            <img
              key={photo.id}
              src={photo.url}
              alt={`${title}, foto ${i + 1} de ${photos.length}`}
              width={photo.width ?? undefined}
              height={photo.height ?? undefined}
              className="h-auto max-h-[70dvh] w-auto max-w-full rounded-sm bg-line-2 object-contain"
            />
          )}
        </div>
        {photos.length > 1 && (
          <IconButton label="Foto seguinte" onClick={() => go(1)}>
            <ChevronRight className="size-5" />
          </IconButton>
        )}
      </div>
      {photos.length > 1 && <p className="mt-2 text-center text-xs text-ink-3">Use as setas do teclado para mudar de foto.</p>}
    </Dialog>
  )
}

interface NewPhoto {
  key: string
  file: File
  preview: string
}

function DiaryEntryDialog({ siteId, siteLabel, entry, camera, onClose }: { siteId: string; siteLabel: string; entry: DiaryEntry | null; camera?: boolean; onClose: () => void }) {
  const org = useActiveOrg()
  const save = useSaveDiaryEntry(org.id, siteId)
  const today = todayIso()
  const [date, setDate] = useState(entry?.date ?? today)
  const [title, setTitle] = useState(entry?.title ?? '')
  const [body, setBody] = useState(entry?.body ?? '')
  const [kept, setKept] = useState<DiaryPhoto[]>(entry?.photos ?? [])
  const [added, setAdded] = useState<NewPhoto[]>([])
  const [preparing, setPreparing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [touched, setTouched] = useState(false)
  const pick = useRef<HTMLInputElement>(null)
  const shoot = useRef<HTMLInputElement>(null)
  // As pré-visualizações locais são libertadas ao fechar o formulário.
  const addedRef = useRef(added)
  useEffect(() => {
    addedRef.current = added
  }, [added])
  useEffect(() => () => addedRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), [])

  const count = kept.length + added.length
  const titleError = touched && !title.trim() ? 'Indique o título (ex.: "Betonagem da laje do piso 2").' : null
  const dateError = touched && (!date || date > today) ? 'Indique uma data até hoje.' : null

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const room = MAX_DIARY_PHOTOS - count
    const list = [...files].filter((f) => f.type.startsWith('image/'))
    if (list.length > room) toast.warning(`Um registo leva no máximo ${MAX_DIARY_PHOTOS} fotos. ${room > 0 ? `Só entram mais ${room}.` : ''}`)
    setPreparing(true)
    try {
      const ready: NewPhoto[] = []
      for (const f of list.slice(0, Math.max(room, 0))) {
        const file = await shrinkPhoto(f)
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${f.name}: a fotografia tem mais de 10 MB.`)
          continue
        }
        ready.push({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file) })
      }
      setAdded((a) => [...a, ...ready])
    } finally {
      setPreparing(false)
    }
  }

  const submit = () => {
    setTouched(true)
    if (!title.trim() || !date || date > today) return
    const removed = (entry?.photos ?? []).filter((p) => !kept.some((k) => k.id === p.id)).map((p) => p.id)
    save.mutate(
      { entry, input: { date, title: title.trim(), body }, add: added.map((a) => a.file), remove: removed, onProgress: (done, total) => setProgress(total ? { done, total } : null) },
      {
        onSuccess: () => {
          toast.success(entry ? 'Registo atualizado' : 'Registo guardado no diário', { description: `${siteLabel} · ${photosLabel(count)}` })
          onClose()
        },
        onError: (error) => {
          setProgress(null)
          toast.error(isApiError(error, 'stale') ? 'Outra pessoa alterou este registo entretanto. Feche e abra de novo.' : errorMessage(error))
        },
      },
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !save.isPending && onClose()}
      size="lg"
      eyebrow={siteLabel}
      title={entry ? 'Editar registo' : 'Novo registo no diário'}
      description="O que se fez e as fotos que se tiraram."
      footer={
        <>
          {progress && progress.total > 0 && (
            <p role="status" className="mr-auto text-xs text-ink-3">
              A enviar fotos {Math.min(progress.done + 1, progress.total)} de {progress.total}…
            </p>
          )}
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={preparing} onClick={submit}>
            {entry ? 'Guardar alterações' : 'Guardar registo'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Data" error={dateError}>
          {(p) => <Input {...p} type="date" value={date} max={today} required onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label="Título" error={titleError}>
          {(p) => <Input {...p} value={title} maxLength={160} required onChange={(e) => setTitle(e.target.value)} placeholder="Betonagem da laje do piso 2" />}
        </Field>
        <Field label="O que se fez" optional className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={4} value={body} maxLength={10000} onChange={(e) => setBody(e.target.value)} placeholder="Trabalhos, materiais recebidos, visitas, incidentes…" />}
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">
            Fotos <span className="font-normal text-ink-3">({count} de {MAX_DIARY_PHOTOS})</span>
          </legend>
          {count > 0 && (
            <ul className="mb-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {kept.map((p, i) => (
                <li key={p.id} className="relative aspect-[4/3] overflow-hidden rounded-sm bg-line-2">
                  <img src={p.url} alt={`Foto ${i + 1} já guardada`} className="size-full object-cover" />
                  <RemovePhoto label={`Remover foto ${i + 1}`} onClick={() => setKept((k) => k.filter((x) => x.id !== p.id))} />
                </li>
              ))}
              {added.map((p, i) => (
                <li key={p.key} className="relative aspect-[4/3] overflow-hidden rounded-sm bg-line-2">
                  <img src={p.preview} alt={`Foto nova ${i + 1} (por enviar)`} className="size-full object-cover" />
                  <RemovePhoto
                    label={`Remover foto nova ${i + 1}`}
                    onClick={() => {
                      URL.revokeObjectURL(p.preview)
                      setAdded((a) => a.filter((x) => x.key !== p.key))
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            {camera && (
              <Button icon={<Camera className="size-4" />} disabled={count >= MAX_DIARY_PHOTOS} loading={preparing} onClick={() => shoot.current?.click()}>
                Tirar foto
              </Button>
            )}
            <Button icon={<ImagePlus className="size-4" />} disabled={count >= MAX_DIARY_PHOTOS} loading={preparing && !camera} onClick={() => pick.current?.click()}>
              {camera ? 'Escolher da galeria' : 'Juntar fotos'}
            </Button>
          </div>
          <input
            ref={pick}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const files = e.target.files
              void addFiles(files).finally(() => (e.target.value = ''))
            }}
          />
          <input
            ref={shoot}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const files = e.target.files
              void addFiles(files).finally(() => (e.target.value = ''))
            }}
          />
          <p className="mt-1.5 text-xs text-ink-3">JPEG, PNG ou WebP. As fotos são reduzidas antes de enviar e só ficam guardadas quando guardar o registo.</p>
        </fieldset>
      </form>
    </Dialog>
  )
}

function RemovePhoto({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-pinho/80 text-white hover:bg-pinho focus-visible:ring-2 focus-visible:ring-lima focus-visible:outline-none"
    >
      <X className="size-4" aria-hidden />
    </button>
  )
}
