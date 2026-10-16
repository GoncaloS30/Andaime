import { ArrowLeft, ArrowRightLeft, Mail, Palmtree, Pencil, Phone, Shirt } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useDerived } from '@/app/hooks'
import { workerCompliance } from '@/domain/documents'
import { useDemo } from '@/store/store'
import { Avatar } from '@/ui/Avatar'
import { PhotoUpload } from '@/ui/PhotoUpload'
import { Badge, Plate } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { TabPanel, Tabs } from '@/ui/Tabs'
import { EmptyState } from '@/ui/States'
import { AbsenceDialog } from '../shared/AbsenceDialog'
import { DeliveryDialog } from '../shared/DeliveryDialog'
import { TransferDialog } from '../shared/TransferDialog'
import { WorkerForm } from './WorkerForm'
import {
  AbsencesTab,
  DocumentsTab,
  EquipmentTab,
  HistoryTab,
  HoursTab,
  OverviewTab,
  ProfessionalTab,
  SitesTab,
  UniformTab,
} from './WorkerTabs'

const TABS = [
  { value: 'visao', label: 'Visão geral' },
  { value: 'profissional', label: 'Dados profissionais' },
  { value: 'obras', label: 'Obras e atribuições' },
  { value: 'horas', label: 'Horas' },
  { value: 'documentos', label: 'Documentos' },
  { value: 'ausencias', label: 'Ausências' },
  { value: 'fardamento', label: 'Fardamento' },
  { value: 'equipamentos', label: 'Equipamentos' },
  { value: 'historico', label: 'Histórico' },
]

export function WorkerDetailPage() {
  const { id = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const tab = TABS.some((t) => t.value === sp.get('tab')) ? sp.get('tab')! : 'visao'
  const setTab = (t: string) => setSp((p) => { const n = new URLSearchParams(p); n.set('tab', t); n.delete('doc'); return n }, { replace: true })
  const w = useDemo((s) => s.db.workers[id])
  const team = useDemo((s) => (w?.teamId ? s.db.teams[w.teamId] : undefined))
  const vehicle = useDemo((s) => (w?.usualVehicleId ? s.db.vehicles[w.usualVehicleId] : undefined))
  const docIssues = useDerived(({ db, session }) => workerCompliance(db, id, session.today).filter((r) => r.state !== 'valido').length, [id])
  const pendingAbs = useDemo((s) => Object.values(s.db.absences).filter((a) => a.workerId === id && a.status === 'pedido').length)
  const [dialog, setDialog] = useState<null | 'edit' | 'transfer' | 'absence' | 'delivery'>(null)

  if (!w) {
    return (
      <EmptyState title="Trabalhador não encontrado" action={<Link to="/trabalhadores" className="text-pinho underline">Voltar à lista</Link>}>
        Pode ter sido removido ao repor a demonstração.
      </EmptyState>
    )
  }

  return (
    <div className="mx-auto max-w-[1280px]">
      <Link to="/trabalhadores" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Trabalhadores
      </Link>
      <header className="mb-2 flex flex-wrap items-start gap-4">
        <Avatar name={w.name} photo={w.photo} size="lg" color={team?.color ?? '#7d847f'} className="size-20 text-2xl" />
        <div className="min-w-[min(100%,18rem)] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-expanded text-2xl font-semibold tracking-tight">{w.name}</h1>
            <Badge tone={w.status === 'ativo' ? 'ok' : 'neutral'} dot>
              {w.status === 'ativo' ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-ink-2">
            {w.category} · N.º {w.number}
            {team && (
              <>
                {' · '}
                <Link to={`/equipas/${team.id}`} className="font-medium text-pinho underline decoration-pinho/40 underline-offset-2 hover:decoration-pinho">
                  {team.name}
                </Link>
              </>
            )}
            {vehicle && (
              <span className="ml-2 inline-flex align-middle">
                <Plate plate={vehicle.plate} />
              </span>
            )}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
            <span className="flex items-center gap-1">
              <Phone className="size-3.5" aria-hidden /> {w.phone || '—'}
            </span>
            <span className="flex items-center gap-1">
              <Mail className="size-3.5" aria-hidden /> {w.email || '—'}
            </span>
          </p>
          <PhotoUpload target={{ type: 'trabalhador', id: w.id }} current={w.photo} alt={`Retrato de ${w.name}`} className="mt-2" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Pencil className="size-4" />} onClick={() => setDialog('edit')}>
            Editar
          </Button>
          <Button icon={<Palmtree className="size-4" />} onClick={() => setDialog('absence')}>
            Ausência
          </Button>
          <Button icon={<Shirt className="size-4" />} onClick={() => setDialog('delivery')}>
            Entregar equipamento
          </Button>
          <Button variant="primary" icon={<ArrowRightLeft className="size-4" />} onClick={() => setDialog('transfer')} data-tour="transfer-worker">
            Transferir
          </Button>
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={setTab}
        label="Ficha do trabalhador"
        tabs={TABS.map((t) => ({
          ...t,
          count: t.value === 'documentos' ? docIssues : t.value === 'ausencias' ? pendingAbs : undefined,
          tone: t.value === 'documentos' ? 'danger' : 'warn',
        }))}
      >
        <TabPanel value="visao"><OverviewTab id={id} /></TabPanel>
        <TabPanel value="profissional"><ProfessionalTab id={id} onEdit={() => setDialog('edit')} /></TabPanel>
        <TabPanel value="obras"><SitesTab id={id} onTransfer={() => setDialog('transfer')} /></TabPanel>
        <TabPanel value="horas"><HoursTab id={id} /></TabPanel>
        <TabPanel value="documentos"><DocumentsTab id={id} openDoc={sp.get('doc')} /></TabPanel>
        <TabPanel value="ausencias"><AbsencesTab id={id} onNew={() => setDialog('absence')} /></TabPanel>
        <TabPanel value="fardamento"><UniformTab id={id} onDeliver={() => setDialog('delivery')} /></TabPanel>
        <TabPanel value="equipamentos"><EquipmentTab id={id} onDeliver={() => setDialog('delivery')} /></TabPanel>
        <TabPanel value="historico"><HistoryTab id={id} /></TabPanel>
      </Tabs>

      {dialog === 'edit' && <WorkerForm open onOpenChange={() => setDialog(null)} workerId={id} />}
      {dialog === 'transfer' && <TransferDialog open onOpenChange={() => setDialog(null)} workerId={id} />}
      {dialog === 'absence' && <AbsenceDialog open onOpenChange={() => setDialog(null)} workerId={id} />}
      {dialog === 'delivery' && <DeliveryDialog open onOpenChange={() => setDialog(null)} workerId={id} />}
    </div>
  )
}
