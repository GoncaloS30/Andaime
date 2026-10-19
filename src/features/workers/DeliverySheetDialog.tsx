import { FileSpreadsheet, Printer } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { useDerived } from '@/app/hooks'
import { deliverySheet, KIND_LABEL, SHEET_DECLARATION, SHEET_HEADER, type SheetRow } from '@/domain/equipment'
import type { ID, Worker } from '@/domain/types'
import { dateNumeric } from '@/domain/weeks'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Overlay'

interface DocProps {
  company: string
  worker: Worker
  issuedAt: string
  rows: SheetRow[]
}

/** A folha em si: igual no ecrã (pré-visualização) e no papel (A4 vertical). */
function SheetDoc({ company, worker, issuedAt, rows }: DocProps) {
  return (
    <article className="bg-white text-[13px] leading-snug text-ink">
      <p className="text-xs text-ink-3">{company}</p>
      <h2 className="font-expanded text-lg font-semibold">Folha de entrega de EPI, fardamento e ferramentas</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
        <dt className="text-ink-3">Trabalhador</dt><dd className="font-medium">{worker.name}</dd>
        <dt className="text-ink-3">N.º</dt><dd className="font-mono">{worker.number}</dd>
        <dt className="text-ink-3">Categoria</dt><dd>{worker.category}</dd>
        <dt className="text-ink-3">Emitida em</dt><dd>{dateNumeric(issuedAt)}</dd>
      </dl>
      <table className="mt-4 w-full border-collapse text-left">
        <thead>
          <tr className="border-b-2 border-pinho">
            {SHEET_HEADER.map((h) => <th key={h} scope="col" className={h === 'Qtd.' ? 'py-1 pr-2 text-right font-semibold' : h === 'N.º de série' ? 'py-1 pl-4 font-semibold' : 'py-1 pr-2 font-semibold'}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.deliveryId} className="border-b border-line">
              <td className="py-1 pr-2 tabular">{dateNumeric(r.date)}</td>
              <td className="py-1 pr-2">{r.name}</td>
              <td className="py-1 pr-2">{KIND_LABEL[r.kind]}</td>
              <td className="py-1 pr-2">{r.size || '—'}</td>
              <td className="py-1 pr-2 text-right tabular">{r.qty}</td>
              <td className="py-1 pl-4 font-mono text-xs">{r.serial || '—'}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6} className="py-3 text-ink-3">Sem artigos entregues.</td></tr>}
        </tbody>
      </table>
      <p className="mt-4 text-xs text-ink-2">{SHEET_DECLARATION}</p>
      <div className="mt-10 grid grid-cols-[1fr_auto] gap-x-8 gap-y-10 text-xs text-ink-2">
        <p className="border-t border-ink-3 pt-1">Assinatura do trabalhador</p>
        <p className="w-32 border-t border-ink-3 pt-1">Data</p>
        <p className="border-t border-ink-3 pt-1">Assinatura de quem entrega</p>
        <p className="w-32 border-t border-ink-3 pt-1">Data</p>
      </div>
    </article>
  )
}

/** Folha de entrega para assinar: pré-visualização, impressão A4 e Excel. */
export function DeliverySheetDialog({ workerId, onClose }: { workerId: ID; onClose: () => void }) {
  const d = useDerived(({ db, session }) => ({ company: db.company.name, worker: db.workers[workerId]!, issuedAt: session.today, rows: deliverySheet(db, workerId) }), [workerId])
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
      const { buildDeliverySheet } = await import('@/lib/excel/deliverySheetExcel')
      const { downloadWorkbook } = await import('@/lib/excel/weeklyExcel')
      const wb = await buildDeliverySheet({ company: d.company, worker: d.worker, issuedAt: d.issuedAt, rows: d.rows })
      await downloadWorkbook(wb, `folha-entrega-${d.worker.number}-${d.issuedAt}.xlsx`)
      toast.success('Folha de entrega descarregada', { description: `${d.rows.length} ${d.rows.length === 1 ? 'artigo' : 'artigos'}` })
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
          <>
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button icon={<FileSpreadsheet className="size-4" />} loading={busy} onClick={() => void excel()}>Descarregar Excel</Button>
            <Button variant="primary" icon={<Printer className="size-4" />} onClick={print}>Imprimir</Button>
          </>
        }
      >
        <div className="rounded-md border border-line bg-white p-6 shadow-e1">
          <SheetDoc {...d} />
        </div>
      </Dialog>
      {createPortal(<div className="print-portal"><SheetDoc {...d} /></div>, document.body)}
    </>
  )
}
