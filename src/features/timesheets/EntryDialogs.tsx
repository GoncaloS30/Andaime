import { ClipboardPen, Pencil, XCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { formatHours, timeRangeHours } from '@/domain/hours'
import type { ID } from '@/domain/types'
import { dateLong } from '@/domain/weeks'
import { useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'

/** Rejeitar / devolver registos: o motivo é obrigatório e chega a quem registou. */
export function RejectDialog({ ids, onClose, mode = 'rejeitar' }: { ids: ID[]; onClose: () => void; mode?: 'rejeitar' | 'devolver' }) {
  const reject = useDemo((s) => s.rejectEntries)
  const giveBack = useDemo((s) => s.returnEntries)
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const verb = mode === 'rejeitar' ? 'Rejeitar' : 'Devolver'
  const save = () => {
    setTouched(true)
    if (!reason.trim()) return
    if (mode === 'rejeitar') reject(ids, reason)
    else giveBack(ids, reason)
    toast.success(`${ids.length} ${ids.length === 1 ? 'registo' : 'registos'} ${mode === 'rejeitar' ? 'rejeitados' : 'devolvidos'}`, { description: 'Quem registou foi notificado com o motivo.' })
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={`${verb} ${ids.length} ${ids.length === 1 ? 'registo' : 'registos'}`}
      description="Explique o que tem de ser corrigido. O motivo fica no registo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" icon={<XCircle className="size-4" />} onClick={save}>{verb}</Button>
        </>
      }
    >
      <Field label="Motivo" error={touched && !reason.trim() ? 'O motivo é obrigatório.' : null}>
        {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: saída às 19:30 sem justificação das horas extra" autoFocus />}
      </Field>
    </Dialog>
  )
}

/** Corrigir um registo: guarda o valor anterior, o novo e o motivo. */
export function CorrectDialog({ id, onClose }: { id: ID; onClose: () => void }) {
  const db = useDemo((s) => s.db)
  const settings = useDemo((s) => s.session.settings)
  const correct = useDemo((s) => s.correctEntry)
  const e = db.entries[id]!
  const [clockIn, setIn] = useState(e.clockIn)
  const [clockOut, setOut] = useState(e.clockOut ?? '17:00')
  const [pause, setPause] = useState(e.breakMinutes)
  const [siteId, setSite] = useState(e.siteId)
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const hours = timeRangeHours(clockIn, clockOut, 0) - pause / 60
  const save = () => {
    setTouched(true)
    if (!reason.trim() || hours <= 0) return
    correct(id, { clockIn, clockOut, breakMinutes: pause, siteId }, reason)
    toast.success('Registo corrigido', { description: 'A correção e o motivo ficam no histórico do registo.' })
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      eyebrow={db.workers[e.workerId]?.name}
      title="Corrigir registo"
      description={dateLong(e.date)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={<Pencil className="size-4" />} onClick={save}>Guardar correção</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Entrada">{(p) => <Input {...p} type="time" value={clockIn} onChange={(x) => setIn(x.target.value)} />}</Field>
        <Field label="Saída">{(p) => <Input {...p} type="time" value={clockOut} onChange={(x) => setOut(x.target.value)} />}</Field>
        <Field label="Pausa (min)">{(p) => <Input {...p} type="number" min={0} step={5} value={pause} onChange={(x) => setPause(Number(x.target.value))} />}</Field>
        <Field label="Obra" className="sm:col-span-3">
          {(p) => (
            <Select {...p} value={siteId} onChange={(x) => setSite(x.target.value)}>
              {Object.values(db.sites).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
            </Select>
          )}
        </Field>
        <p className="text-sm text-ink-2 sm:col-span-3">Total: <strong>{hours > 0 ? formatHours(Math.round(hours * 100) / 100) : '—'}</strong> (normal diário {settings.dailyNormal} h)</p>
        <Field label="Motivo da correção" className="sm:col-span-3" error={touched && !reason.trim() ? 'Indique o motivo.' : null}>
          {(p) => <Textarea {...p} value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Ex.: esqueceu-se de registar a saída; confirmado em obra" />}
        </Field>
      </div>
    </Dialog>
  )
}

/** Registo manual de horas (em nome de um trabalhador). */
export function ManualEntryDialog({ onClose, workerIds }: { onClose: () => void; workerIds?: ID[] }) {
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const role = useDemo((s) => s.session.role)
  const create = useDemo((s) => s.createManualEntry)
  const pool = (workerIds ?? Object.keys(db.workers)).map((id) => db.workers[id]!).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))
  const [workerId, setWorker] = useState(pool[0]?.id ?? '')
  const assigned = Object.values(db.assignments).find((a) => a.workerId === workerId && a.date === today)
  const [siteId, setSite] = useState<string>('')
  const [date, setDate] = useState(today)
  const [clockIn, setIn] = useState('08:00')
  const [clockOut, setOut] = useState('17:00')
  const [pause, setPause] = useState(60)
  const [note, setNote] = useState('')
  const site = siteId || assigned?.siteId || ''
  const dup = Object.values(db.entries).some((e) => e.workerId === workerId && e.date === date && e.status !== 'rejeitado')
  const save = () => {
    create({ workerId, siteId: site, date, clockIn, clockOut, breakMinutes: pause, note })
    toast.success('Horas registadas', { description: role === 'gestor' ? 'Ficam já aprovadas.' : 'Ficam revistas e seguem para aprovação do gestor.' })
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Registar horas manualmente"
      description={role === 'gestor' ? 'O registo fica aprovado.' : 'O registo fica revisto por si e segue para o gestor.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={<ClipboardPen className="size-4" />} disabled={!workerId || !site || clockOut <= clockIn} onClick={save}>Registar horas</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Trabalhador" className="sm:col-span-3">
          {(p) => (
            <Select {...p} value={workerId} onChange={(e) => setWorker(e.target.value)}>
              {pool.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Dia" error={dup ? 'Já há um registo neste dia. Corrija-o em vez de criar outro.' : null}>{(p) => <Input {...p} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Entrada">{(p) => <Input {...p} type="time" value={clockIn} onChange={(e) => setIn(e.target.value)} />}</Field>
        <Field label="Saída">{(p) => <Input {...p} type="time" value={clockOut} onChange={(e) => setOut(e.target.value)} />}</Field>
        <Field label="Obra" className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={site} onChange={(e) => setSite(e.target.value)}>
              <option value="">Escolher…</option>
              {Object.values(db.sites).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Pausa (min)">{(p) => <Input {...p} type="number" min={0} step={5} value={pause} onChange={(e) => setPause(Number(e.target.value))} />}</Field>
        <Field label="Nota" optional className="sm:col-span-3">{(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </div>
    </Dialog>
  )
}
