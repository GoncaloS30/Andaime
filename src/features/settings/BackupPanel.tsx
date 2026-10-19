import { Download, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { parseBackup, type Backup } from '@/domain/backup'
import { dateShort } from '@/domain/weeks'
import { backupBlob, formatBytes, restorePhotos, uploadedPhotosSize } from '@/lib/backupFile'
import { download } from '@/lib/exportTable'
import { STORE_VERSION } from '@/store/persistence'
import type { DB } from '@/domain/types'
import type { Session } from '@/store/types'
import { demoStore, useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { Checkbox } from '@/ui/Field'
import { Panel } from '@/ui/Layout'
import { Dialog } from '@/ui/Overlay'

/** Exportar o estado da demonstração para JSON e importar uma cópia (com validação e confirmação). */
export function BackupPanel() {
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const importDemo = useDemo((s) => s.importDemo)
  const [withPhotos, setWithPhotos] = useState(false)
  const [size, setSize] = useState<{ count: number; bytes: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ backup: Backup; file: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    void uploadedPhotosSize(db).then((r) => alive && setSize(r))
    return () => {
      alive = false
    }
  }, [db])

  const exportNow = async () => {
    setBusy(true)
    try {
      const s = demoStore.getState()
      const now = new Date().toISOString()
      const blob = await backupBlob({ db: s.db, session: s.session }, STORE_VERSION, now, withPhotos && !!size?.count)
      download(blob, `andaime-demo-${today}.json`)
      toast.success('Cópia descarregada', { description: `${formatBytes(blob.size)}${withPhotos && size?.count ? ` · com ${size.count} ${size.count === 1 ? 'foto' : 'fotos'}` : ''}` })
    } finally {
      setBusy(false)
    }
  }

  const pick = async (f: File | undefined) => {
    if (!f) return
    setError(null)
    const r = parseBackup(await f.text(), STORE_VERSION)
    if (input.current) input.current.value = ''
    if (!r.ok) return setError(r.error)
    setPending({ backup: r.backup, file: f.name })
  }

  const confirm = async () => {
    if (!pending) return
    const { backup } = pending
    importDemo({ db: backup.db as DB, session: backup.session as Session })
    const n = await restorePhotos(backup.photos)
    setPending(null)
    toast.success('Cópia importada', { description: n ? `Com ${n} ${n === 1 ? 'foto carregada' : 'fotos carregadas'}.` : 'Os dados da demonstração foram substituídos.' })
  }

  const photos = Object.keys(pending?.backup.photos ?? {}).length
  return (
    <Panel title="Cópia da demonstração" description="Guarde o estado atual num ficheiro e retome-o mais tarde, noutro navegador ou noutro computador.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Exportar</h3>
          <Checkbox
            label={size?.count ? `Incluir as fotos carregadas (${size.count}, cerca de ${formatBytes(size.bytes * 1.37)})` : 'Incluir as fotos carregadas (não há nenhuma)'}
            checked={withPhotos && !!size?.count}
            disabled={!size?.count}
            onChange={(e) => setWithPhotos(e.target.checked)}
          />
          {withPhotos && size && size.bytes > 5 * 1024 * 1024 && <p className="text-xs text-ambar-ink">A cópia fica grande: as fotos vão dentro do ficheiro.</p>}
          <Button className="w-fit" icon={<Download className="size-4" />} loading={busy} onClick={() => void exportNow()}>
            Exportar cópia (JSON)
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Importar</h3>
          <p className="text-xs text-ink-3">Substitui todos os dados desta demonstração. Pede confirmação antes.</p>
          <input ref={input} type="file" accept="application/json,.json" className="sr-only" id="import-backup" onChange={(e) => void pick(e.target.files?.[0])} />
          <Button className="w-fit" icon={<Upload className="size-4" />} onClick={() => input.current?.click()}>
            Escolher ficheiro…
          </Button>
          {error && <p role="alert" className="text-sm text-tijolo-ink">{error}</p>}
        </div>
      </div>
      {pending && (
        <Dialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          size="sm"
          title="Substituir os dados por esta cópia?"
          description={`${pending.file} · exportada a ${dateShort(pending.backup.exportedAt.slice(0, 10))}, ${pending.backup.exportedAt.slice(11, 16)}${photos ? ` · ${photos} ${photos === 1 ? 'foto' : 'fotos'}` : ''}`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPending(null)}>Manter os dados atuais</Button>
              <Button variant="danger" icon={<Upload className="size-4" />} onClick={() => void confirm()}>Importar cópia</Button>
            </>
          }
        >
          <p className="text-sm text-ink-2">Tudo o que está nesta demonstração é substituído. Não é possível anular. O papel que está a usar mantém-se.</p>
        </Dialog>
      )}
    </Panel>
  )
}
