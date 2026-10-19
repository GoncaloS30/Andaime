import { Palmtree } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ABSENCE_NOTE, ABSENCE_TYPE } from '@/domain/labels'
import type { AbsenceType, ID } from '@/domain/types'
import { addDays, dateShort } from '@/domain/weeks'
import { useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { Field, Input, Select, Textarea } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  workerId?: ID
}

/** Registar uma ausência (gestor: fica aprovada; pedido em nome do trabalhador: fica pendente). */
export function AbsenceDialog({ open, onOpenChange, workerId }: Props) {
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const createAbsence = useDemo((s) => s.createAbsence)
  const [wid, setWid] = useState(workerId ?? '')
  const [type, setType] = useState<AbsenceType>('ferias')
  const [start, setStart] = useState(addDays(today, 7))
  const [end, setEnd] = useState(addDays(today, 9))
  const [hours, setHours] = useState(4)
  const [reason, setReason] = useState('')
  const invalid = end < start

  const save = () => {
    createAbsence({ workerId: wid, type, start, end: type === 'parcial' ? start : end, hours: type === 'parcial' ? hours : null, reason })
    toast.success(`${ABSENCE_TYPE[type]} registada`, { description: `${db.workers[wid]?.name}: ${dateShort(start)}${type !== 'parcial' && end !== start ? ` a ${dateShort(end)}` : ''}. O planeamento mostra os conflitos que isto cria.` })
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Registar ausência"
      description="Fica aprovada e passa logo a contar na disponibilidade."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<Palmtree className="size-4" />} disabled={!wid || invalid} onClick={save}>
            Registar ausência
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!workerId && (
          <Field label="Trabalhador" className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={wid} onChange={(e) => setWid(e.target.value)}>
                <option value="">Escolher…</option>
                {Object.values(db.workers).sort((a, b) => a.name.localeCompare(b.name)).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Tipo" hint={ABSENCE_NOTE[type]} className="sm:col-span-2">
          {(p) => (
            <Select {...p} value={type} onChange={(e) => setType(e.target.value as AbsenceType)}>
              {Object.entries(ABSENCE_TYPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={type === 'parcial' ? 'Dia' : 'De'}>{(p) => <Input {...p} type="date" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        {type === 'parcial' ? (
          <Field label="Horas de ausência">{(p) => <Input {...p} type="number" min={1} max={8} value={hours} onChange={(e) => setHours(Number(e.target.value))} />}</Field>
        ) : (
          <Field label="Até" error={invalid ? 'A data de fim é anterior à de início.' : null}>
            {(p) => <Input {...p} type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />}
          </Field>
        )}
        <Field label="Motivo" optional className="sm:col-span-2">
          {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}
