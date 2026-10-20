import { FileSpreadsheet, Printer } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Overlay'
import { downloadFile, errorMessage } from '../../api/http'
import { CATEGORY_LABEL, type Holding } from '../../api/operations'

const HEADER = ['Data', 'Artigo', 'Categoria', 'Tamanho', 'Qtd.', 'N.º de série']
const DECLARATION =
  'Declaro que recebi os artigos acima, em bom estado, e que me comprometo a usá-los nas tarefas a que se destinam e a devolvê-los quando me forem pedidos.'

const fmt = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-PT') : '—')

interface Props {
  orgId: string
  orgName: string
  employee: { id: string; name: string; number?: string; category?: string }
  holdings: Holding[]
  onClose: () => void
}

/** A folha em si: igual no ecrã (pré-visualização) e no papel (A4 vertical, `@page folha`). */
function Sheet({ orgName, employee, holdings }: Omit<Props, 'orgId' | 'onClose'>) {
  const rows = [...holdings].sort((a, b) => (a.lastDeliveredOn ?? '').localeCompare(b.lastDeliveredOn ?? '') || a.itemName.localeCompare(b.itemName, 'pt'))
  return (
    <article className="bg-white text-[13px] leading-snug text-ink">
      <p className="text-xs text-ink-3">{orgName}</p>
      <h2 className="font-expanded text-lg font-semibold">Folha de entrega de EPI, fardamento e ferramentas</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
        <dt className="text-ink-3">Trabalhador</dt>
        <dd className="font-medium">{employee.name}</dd>
        {employee.number && (<><dt className="text-ink-3">N.º</dt><dd className="font-mono">{employee.number}</dd></>)}
        {employee.category && (<><dt className="text-ink-3">Categoria</dt><dd>{employee.category}</dd></>)}
        <dt className="text-ink-3">Emitida em</dt>
        <dd>{new Date().toLocaleDateString('pt-PT')}</dd>
      </dl>
      <table className="mt-4 w-full border-collapse text-left">
        <thead>
          <tr className="border-b-2 border-pinho">
            {HEADER.map((h) => (
              <th key={h} scope="col" className={h === 'Qtd.' ? 'py-1 pr-2 text-right font-semibold' : 'py-1 pr-2 font-semibold'}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.itemId} className="border-b border-line">
              <td className="py-1 pr-2 tabular">{fmt(h.lastDeliveredOn)}</td>
              <td className="py-1 pr-2">{h.itemName}</td>
              <td className="py-1 pr-2">{CATEGORY_LABEL[h.category]}</td>
              <td className="py-1 pr-2">{h.size ?? '—'}</td>
              <td className="py-1 pr-2 text-right tabular">{h.quantity}</td>
              <td className="py-1 pl-2 font-mono text-xs">{h.serials.length ? h.serials.join(', ') : '—'}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={6} className="py-3 text-ink-3">Sem artigos em seu poder.</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-4 text-xs text-ink-2">{DECLARATION}</p>
      <div className="mt-10 grid grid-cols-[1fr_auto] gap-x-8 gap-y-10 text-xs text-ink-2">
        <p className="border-t border-ink-3 pt-1">Assinatura do trabalhador</p>
        <p className="w-32 border-t border-ink-3 pt-1">Data</p>
        <p className="border-t border-ink-3 pt-1">Assinatura de quem entrega</p>
        <p className="w-32 border-t border-ink-3 pt-1">Data</p>
      </div>
    </article>
  )
}

/** Folha de entrega para assinar: pré-visualização, impressão A4 e Excel gerado no servidor. */
export function DeliverySheetDialog({ orgId, orgName, employee, holdings, onClose }: Props) {
  const [busy, setBusy] = useState(false)

  const print = () => {
    document.body.classList.add('printing-sheet')
    const done = () => {
      document.body.classList.remove('printing-sheet')
      window.removeEventListener('afterprint', done)
    }
    window.addEventListener('afterprint', done)
    window.print()
  }

  const excel = async () => {
    setBusy(true)
    try {
      await downloadFile(`/orgs/${orgId}/equipment/holdings/${employee.id}/sheet.xlsx`, 'folha-entrega.xlsx')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        size="lg"
        title="Folha de entrega"
        description="O que a pessoa tem em seu poder, para assinar. Os artigos devolvidos não entram."
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button icon={<FileSpreadsheet className="size-4" />} loading={busy} onClick={() => void excel()}>Descarregar Excel</Button>
            <Button variant="primary" icon={<Printer className="size-4" />} onClick={print}>Imprimir</Button>
          </div>
        }
      >
        <div className="rounded-md border border-line bg-white p-6">
          <Sheet orgName={orgName} employee={employee} holdings={holdings} />
        </div>
      </Dialog>
      {createPortal(
        <div className="print-portal">
          <Sheet orgName={orgName} employee={employee} holdings={holdings} />
        </div>,
        document.body,
      )}
    </>
  )
}
