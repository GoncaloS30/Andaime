import { Smartphone, X } from 'lucide-react'
import { WorkerApp } from '../worker-app/WorkerApp'
import { ForemanPhone } from './ForemanPhone'
import { useTour } from './tourStore'

/**
 * Palco dividido: o telemóvel do trabalhador (ou o diário do encarregado) ao lado do backoffice, sobre o mesmo estado vivo.
 * O que se faz num lado aparece no outro sem recarregar.
 */
export function StageFrame() {
  const tab = useTour((s) => s.stageTab)
  const setTab = useTour((s) => s.setStageTab)
  const setStage = useTour((s) => s.setStage)
  const open = useTour((s) => s.open)
  const app = useTour((s) => s.stageApp)
  const who = app === 'encarregado' ? 'App do encarregado' : 'App do trabalhador'
  return (
    <aside
      aria-label={`Telemóvel: ${who.toLowerCase()} (palco dividido)`}
      className={`fixed bottom-4 z-40 hidden animate-drawer-in flex-col items-center gap-2 lg:flex ${open ? 'right-4 xl:right-[372px]' : 'right-4'}`}
    >
      <div className="flex w-full items-center justify-between gap-2 rounded-md bg-pinho px-3 py-1.5 text-xs font-semibold text-white">
        <span className="flex items-center gap-1.5"><Smartphone className="size-3.5 text-lima" aria-hidden /> {who} · ao vivo</span>
        <button type="button" onClick={() => setStage(false)} aria-label="Fechar telemóvel" className="rounded-sm p-0.5 hover:bg-white/10"><X className="size-3.5" /></button>
      </div>
      <div className="h-[min(720px,calc(100dvh-7rem))] w-[340px] overflow-hidden rounded-[30px] border-[7px] border-pinho bg-cal shadow-e2">
        {app === 'encarregado' ? <ForemanPhone /> : <WorkerApp embedded tab={tab} onTabChange={setTab} />}
      </div>
    </aside>
  )
}
