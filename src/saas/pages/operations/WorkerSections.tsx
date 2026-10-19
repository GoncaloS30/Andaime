import { CalendarPlus, FileUp } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Panel } from '@/ui/Layout'
import {
  ABSENCE_KIND_LABEL,
  ABSENCE_STATUS_LABEL,
  ABSENCE_STATUS_TONE,
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  useAbsences,
  useDocuments,
} from '../../api/operations'
import { useClock } from '../../api/timekeeping'
import { addDaysIso, formatDate, todayIso } from '../../api/workforce'
import { useActiveOrg } from '../../session'
import { RequestAbsenceDialog } from './AbsencesPage'
import { UploadDialog } from './DocumentsPage'

/** Ausências e documentos do próprio trabalhador, na app (só com a conta ligada à ficha). */
export function WorkerSections() {
  const org = useActiveOrg()
  const clock = useClock(org.id)
  const employeeId = clock.data?.employeeId
  const today = todayIso()
  const absences = useAbsences(org.id, addDaysIso(today, -30), addDaysIso(today, 365))
  const documents = useDocuments(org.id)
  const [requesting, setRequesting] = useState(false)
  const [uploading, setUploading] = useState(false)
  if (!employeeId) return null
  return (
    <>
      <Panel
        title="Ausências"
        actions={
          <Button size="sm" icon={<CalendarPlus className="size-4" />} onClick={() => setRequesting(true)}>
            Pedir
          </Button>
        }
      >
        {(absences.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-3">Sem ausências pedidas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {absences.data!.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {ABSENCE_KIND_LABEL[a.kind]} · {a.startsOn === a.endsOn ? formatDate(a.startsOn) : `${formatDate(a.startsOn)} – ${formatDate(a.endsOn)}`}
                </span>
                <Badge tone={ABSENCE_STATUS_TONE[a.status]}>{ABSENCE_STATUS_LABEL[a.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel
        title="Os meus documentos"
        actions={
          <Button size="sm" icon={<FileUp className="size-4" />} onClick={() => setUploading(true)}>
            Enviar
          </Button>
        }
      >
        {(documents.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-3">Ainda não enviou documentos.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {documents.data!.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {d.typeName}
                  {d.expiresOn && <span className="text-ink-3"> · até {formatDate(d.expiresOn)}</span>}
                </span>
                <Badge tone={DOC_STATUS_TONE[d.status]}>{DOC_STATUS_LABEL[d.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {requesting && <RequestAbsenceDialog onClose={() => setRequesting(false)} />}
      {uploading && <UploadDialog preset={{ employeeId }} selfOnly onClose={() => setUploading(false)} />}
    </>
  )
}
