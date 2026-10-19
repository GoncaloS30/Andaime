import { BookOpen, FileText, MoreHorizontal, Pencil, Plus, Search, Sheet, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { diaryMonths, filterDiary, MAX_DIARY_PHOTOS } from '@/domain/diary'
import type { PhotoRef } from '@/domain/photos'
import type { DiaryEntry, Site } from '@/domain/types'
import { dayShort, monthLabel } from '@/domain/weeks'
import { cn } from '@/lib/cn'
import { useDemo } from '@/store/store'
import { Button, IconButton } from '@/ui/Button'
import { Field, Input, Textarea } from '@/ui/Field'
import { Gallery } from '@/ui/Gallery'
import { Menu } from '@/ui/Menu'
import { Dialog } from '@/ui/Overlay'
import { Photo } from '@/ui/Photo'
import { PhotoPicker } from '@/ui/PhotoPicker'
import { EmptyState } from '@/ui/States'

const THUMBS = 4

/** Diário de obra: linha do tempo por dia, atalhos por mês, pesquisa sem acentos, galeria e exportações. */
export function SiteDiary({ site, camera }: { site: Site; camera?: boolean }) {
  const all = useDemo((s) => s.db.diary)
  const role = useDemo((s) => s.session.role)
  const persona = useDemo((s) => s.session.personas[s.session.role])
  const remove = useDemo((s) => s.removeDiaryEntry)
  const undo = useDemo((s) => s.undo)
  const entries = useMemo(() => Object.values(all).filter((e) => e.siteId === site.id), [all, site.id])
  const [month, setMonth] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<DiaryEntry | 'novo' | null>(null)
  const [gallery, setGallery] = useState<{ photos: PhotoRef[]; title: string; index: number } | null>(null)
  const [exporting, setExporting] = useState<'word' | 'excel' | null>(null)
  const months = useMemo(() => diaryMonths(entries), [entries])
  const list = useMemo(() => filterDiary(entries, { month, query }), [entries, month, query])
  const days = useMemo(() => {
    const m = new Map<string, DiaryEntry[]>()
    for (const e of list) m.set(e.date, [...(m.get(e.date) ?? []), e])
    return [...m.entries()]
  }, [list])
  const canEdit = (e: DiaryEntry) => role === 'gestor' || e.authorId === persona
  const scopeLabel = month ? monthLabel(`${month}-01`) : 'todos os registos'

  const doExport = async (kind: 'word' | 'excel') => {
    setExporting(kind)
    try {
      const m = await import('@/lib/docx/exportDiary')
      if (kind === 'word') await m.exportDiaryWord(site, list, scopeLabel, month ?? '')
      else await m.exportDiaryExcel(site, list, month ?? '')
      toast.success(kind === 'word' ? 'Diário exportado para Word' : 'Diário exportado para Excel', { description: `${list.length} ${list.length === 1 ? 'registo' : 'registos'} · ${scopeLabel}` })
    } catch {
      toast.error('Não foi possível exportar o diário. Tente de novo.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <section aria-label={`Diário de obra de ${site.name}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
          <label className="sr-only" htmlFor={`dq-${site.id}`}>Procurar no diário</label>
          <Input id={`dq-${site.id}`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar (ex.: betonagem)" className="w-56 pl-8" />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" icon={<FileText className="size-3.5" />} loading={exporting === 'word'} disabled={!list.length} onClick={() => void doExport('word')} data-tour="diary-export">Word</Button>
          <Button size="sm" icon={<Sheet className="size-3.5" />} loading={exporting === 'excel'} disabled={!list.length} onClick={() => void doExport('excel')}>Excel</Button>
          <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing('novo')} data-tour="diary-new">Novo registo</Button>
        </div>
      </div>

      {months.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mês">
          {[{ month: null as string | null, count: entries.length }, ...months].map((m) => (
            <button
              key={m.month ?? 'todos'}
              type="button"
              aria-pressed={month === m.month}
              onClick={() => setMonth(m.month)}
              className={cn('rounded-full border px-2.5 py-1 text-xs font-medium', month === m.month ? 'border-pinho bg-pinho text-white' : 'border-line bg-surface text-ink-2 hover:border-ink-4')}
            >
              {m.month ? monthLabel(`${m.month}-01`) : 'Todos'} <span className="tabular opacity-75">{m.count}</span>
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          {entries.length === 0 ? (
            <EmptyState icon={<BookOpen />} title="Comece o diário desta obra" action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('novo')}>Novo registo</Button>}>
              Um registo por dia com o que se fez e as fotos que se tiraram. Fica a linha do tempo da obra.
            </EmptyState>
          ) : (
            <EmptyState icon={<Search />} title="Nenhum registo encontrado">Experimente outra palavra ou escolha outro mês.</EmptyState>
          )}
        </div>
      ) : (
        <ol className="flex flex-col">
          {days.map(([date, items]) => (
            <li key={date} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3">
              <div className="flex flex-col items-center pt-1 text-center">
                <span className="font-mono text-[11px] font-semibold text-ink-3 uppercase">{dayShort(date)}</span>
                <span className="font-expanded text-xl leading-none font-semibold tabular">{Number(date.slice(8))}</span>
                <span className="text-[11px] text-ink-3">{monthLabel(date).split(' ')[0]!.slice(0, 3)}</span>
                <span aria-hidden className="mt-1 w-px flex-1 bg-line" />
              </div>
              <div className="flex flex-col gap-3 pb-5">
                {items.map((e) => (
                  <article key={e.id} className="rounded-lg border border-line bg-surface p-3">
                    <header className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-ink">{e.title}</h3>
                        <p className="text-xs text-ink-3">
                          {e.authorName} · {e.authorRole === 'gestor' ? 'Direção de obra' : 'Encarregado'} · {e.createdAt.slice(11, 16)}
                          {e.photos.length > 0 && ` · ${e.photos.length === 1 ? '1 foto' : `${e.photos.length} fotos`}`}
                        </p>
                      </div>
                      {canEdit(e) && (
                        <Menu
                          trigger={
                            <IconButton label={`Ações do registo ${e.title}`} size="sm">
                              <MoreHorizontal className="size-4" />
                            </IconButton>
                          }
                          items={[
                            { label: 'Editar', icon: <Pencil className="size-3.5" />, onSelect: () => setEditing(e) },
                            {
                              label: 'Apagar',
                              icon: <Trash2 className="size-3.5" />,
                              danger: true,
                              onSelect: () => {
                                remove(e.id)
                                toast('Registo apagado', { action: { label: 'Anular', onClick: () => undo() } })
                              },
                            },
                          ]}
                        />
                      )}
                    </header>
                    {e.text && <p className="mt-1.5 text-sm whitespace-pre-line text-ink-2">{e.text}</p>}
                    {e.photos.length > 0 && (
                      <ul className="mt-2.5 flex flex-wrap gap-1.5">
                        {e.photos.slice(0, THUMBS).map((p, i) => {
                          const more = i === THUMBS - 1 && e.photos.length > THUMBS ? e.photos.length - THUMBS : 0
                          return (
                            <li key={i}>
                              <button
                                type="button"
                                onClick={() => setGallery({ photos: e.photos, title: e.title, index: i })}
                                aria-label={more ? `Ver as ${e.photos.length} fotos de ${e.title}` : `Ver foto ${i + 1} de ${e.title}`}
                                className="relative block w-24 overflow-hidden rounded-sm focus-visible:ring-2 focus-visible:ring-pinho sm:w-28"
                              >
                                <Photo photo={p} format="viatura" alt="" sizes="112px" rounded="sm" fallback={null} />
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
      )}

      {editing && <DiaryDialog site={site} entry={editing === 'novo' ? null : editing} camera={camera} onClose={() => setEditing(null)} />}
      <Gallery photos={gallery?.photos ?? []} index={gallery?.index ?? null} onIndex={(i) => setGallery(i === null ? null : { ...gallery!, index: i })} title={gallery?.title ?? ''} />
    </section>
  )
}

function DiaryDialog({ site, entry, camera, onClose }: { site: Site; entry: DiaryEntry | null; camera?: boolean; onClose: () => void }) {
  const today = useDemo((s) => s.session.today)
  const create = useDemo((s) => s.createDiaryEntry)
  const update = useDemo((s) => s.updateDiaryEntry)
  const undo = useDemo((s) => s.undo)
  const [date, setDate] = useState(entry?.date ?? today)
  const [title, setTitle] = useState(entry?.title ?? '')
  const [text, setText] = useState(entry?.text ?? '')
  const [photos, setPhotos] = useState<PhotoRef[]>(entry?.photos ?? [])
  const [touched, setTouched] = useState(false)
  const titleError = touched && !title.trim() ? 'Indique o título (ex.: "Betonagem da laje do piso 2").' : null

  const save = () => {
    setTouched(true)
    if (!title.trim()) return
    if (entry) update(entry.id, { date, title, text, photos })
    else create({ siteId: site.id, date, title, text, photos })
    toast.success(entry ? 'Registo atualizado' : 'Registo guardado no diário', {
      description: `${site.code} · ${photos.length === 1 ? '1 foto' : `${photos.length} fotos`}`,
      action: { label: 'Anular', onClick: () => undo() },
    })
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      eyebrow={`${site.code} · ${site.name}`}
      title={entry ? 'Editar registo' : 'Novo registo no diário'}
      description="O que se fez hoje e as fotos que se tiraram."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>{entry ? 'Guardar alterações' : 'Guardar registo'}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Field label="Data">{(p) => <Input {...p} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Título" error={titleError}>{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Betonagem da laje do piso 2" />}</Field>
        <Field label="O que se fez" className="sm:col-span-2">{(p) => <Textarea {...p} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Trabalhos, materiais recebidos, visitas, incidentes…" />}</Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium">Fotos</p>
          <PhotoPicker value={photos} onChange={setPhotos} max={MAX_DIARY_PHOTOS} altBase={title.trim() || 'Registo do diário'} camera={camera} />
        </div>
      </div>
    </Dialog>
  )
}
