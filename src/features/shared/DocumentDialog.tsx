import { FileUp } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DOC_STATE_LABEL, docState, latestDoc } from '@/domain/documents'
import type { DocOwnerType, ID } from '@/domain/types'
import { addDays, dateNumeric } from '@/domain/weeks'
import { useDemo } from '@/store/store'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Field, Input, Textarea } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  ownerType: DocOwnerType
  ownerId: ID
  typeId: ID
}

/** Fluxo 9 — atualizar (nova versão) ou registar um documento em falta. */
export function DocumentDialog({ open, onOpenChange, ownerType, ownerId, typeId }: Props) {
  const db = useDemo((s) => s.db)
  const today = useDemo((s) => s.session.today)
  const role = useDemo((s) => s.session.role)
  const updateDocument = useDemo((s) => s.updateDocument)
  const addDocument = useDemo((s) => s.addDocument)
  const t = db.docTypes[typeId]
  const current = latestDoc(db, ownerId, typeId)
  const state = docState(current, today)
  const suggested = t?.validityMonths ? addDays(today, Math.round(t.validityMonths * 30.4)) : ''
  const [number, setNumber] = useState(current?.number ?? '')
  const [expires, setExpires] = useState<string>(suggested)
  const [note, setNote] = useState('')
  const owner = ownerType === 'trabalhador' ? db.workers[ownerId]?.name : ownerType === 'obra' ? db.sites[ownerId]?.code : db.company.name
  const invalidDate = !!expires && expires < today

  const save = () => {
    if (current) {
      updateDocument(current.id, { expiresAt: expires || null, number: number.trim() || undefined, note, fileName: `${t?.short ?? 'documento'}_${today}.pdf` })
    } else {
      addDocument({ typeId, ownerType, ownerId, number: number.trim(), issuedAt: today, expiresAt: expires || null, fileName: `${t?.short ?? 'documento'}_${today}.pdf` })
    }
    toast.success(`${t?.short} de ${owner} ${current ? 'atualizado' : 'registado'}`, {
      description: role === 'gestor' ? 'Marcado como verificado.' : 'Fica por verificar pelo gestor.',
    })
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      eyebrow={owner}
      title={current ? `Atualizar ${t?.name}` : `Registar ${t?.name}`}
      description={t?.description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<FileUp className="size-4" />} disabled={invalidDate} onClick={save} data-tour="save-document">
            {current ? 'Guardar nova versão' : 'Registar documento'}
          </Button>
        </>
      }
    >
      {current && (
        <div className="mb-4 flex items-center justify-between rounded-md bg-cal px-3 py-2 text-sm">
          <span>
            Versão {current.versions.at(-1)?.version ?? 1} · {current.expiresAt ? `válido até ${dateNumeric(current.expiresAt)}` : 'sem validade'}
          </span>
          <Badge tone={state === 'valido' ? 'ok' : state === 'a_expirar' || state === 'por_verificar' ? 'warn' : 'danger'} dot>
            {DOC_STATE_LABEL[state]}
          </Badge>
        </div>
      )}
      <div className="grid gap-4">
        <div className="rounded-md border border-dashed border-ink-4 px-3 py-4 text-center text-sm text-ink-3">
          <FileUp className="mx-auto mb-1 size-5" aria-hidden />
          Ficheiro de demonstração: <span className="font-mono text-xs">{t?.short.replace(/\s+/g, '_')}_{today}.pdf</span>
          <p className="mt-1 text-xs">Nesta demonstração não é carregado nenhum ficheiro real.</p>
        </div>
        <Field label="Número do documento" optional>
          {(p) => <Input {...p} value={number} onChange={(e) => setNumber(e.target.value)} />}
        </Field>
        <Field
          label="Válido até"
          hint={t?.validityMonths ? `Validade habitual: ${t.validityMonths} meses.` : 'Deixe vazio se não expira.'}
          error={invalidDate ? 'A nova validade já passou. Indique uma data futura.' : null}
        >
          {(p) => <Input {...p} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />}
        </Field>
        <Field label="Nota da versão" optional>
          {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: renovado junto da Segurança Social" />}
        </Field>
      </div>
    </Dialog>
  )
}
