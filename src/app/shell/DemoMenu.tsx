import { FlaskConical, RotateCcw, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { DEMO_LABEL, ROLE_HOME } from '@/copy'
import { persistEnabled, setPersistEnabled, saveSnapshot } from '@/store/persistence'
import { demoStore, useDemo } from '@/store/store'
import { Button, buttonStyles } from '@/ui/Button'
import { Switch } from '@/ui/Field'
import { Dialog } from '@/ui/Overlay'
import { Popover } from '@/ui/Menu'

/** Identificação permanente de demonstração, com repor, persistência e estados simulados. */
export function DemoMenu() {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [persist, setPersist] = useState(persistEnabled())
  const flags = useDemo((s) => s.session.flags)
  const setFlag = useDemo((s) => s.setFlag)
  const reset = useDemo((s) => s.resetDemo)
  const role = useDemo((s) => s.session.role)
  const navigate = useNavigate()

  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}
        align="end"
        label="Opções da demonstração"
        className="w-80"
        trigger={
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-md border border-dashed border-ambar/70 bg-ambar-soft px-2.5 text-xs font-semibold text-ambar-ink hover:bg-[#f7e7c4]"
          >
            <FlaskConical className="size-3.5" aria-hidden />
            <span className="hidden xl:inline">{DEMO_LABEL}</span>
            <span className="xl:hidden">Demonstração</span>
          </button>
        }
      >
        <p className="font-wide text-sm font-semibold">Protótipo demonstrativo</p>
        <p className="mt-1 text-xs text-ink-3">
          Empresa, pessoas, obras e documentos são fictícios. As ações alteram dados locais deste navegador e não são enviadas para
          nenhum servidor.
        </p>
        <div className="mt-3 flex flex-col gap-3 border-t border-line-2 pt-3">
          <Switch
            label="Guardar neste navegador"
            description="Mantém as alterações ao recarregar a página."
            checked={persist}
            onChange={(v) => {
              setPersist(v)
              setPersistEnabled(v)
              if (v) {
                const s = demoStore.getState()
                saveSnapshot(s.db, s.session)
              }
            }}
          />
          <Switch
            label="Simular empresa sem dados"
            description="Mostra os estados vazios dos módulos."
            checked={flags.emptyCompany}
            onChange={(v) => setFlag('emptyCompany', v)}
          />
          <Switch
            label="Simular falha de ligação"
            description="Mostra os estados de erro dos módulos."
            checked={flags.simulateError}
            onChange={(v) => setFlag('simulateError', v)}
          />
        </div>
        <div className="mt-3 flex gap-2 border-t border-line-2 pt-3">
          <Button size="sm" variant="danger" icon={<RotateCcw className="size-3.5" />} onClick={() => setConfirm(true)}>
            Repor demonstração
          </Button>
          <Link to="/definicoes" onClick={() => setOpen(false)} className={buttonStyles('ghost', 'sm')}>
            <Settings2 className="size-3.5" aria-hidden />
            Definições
          </Link>
        </div>
      </Popover>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        size="sm"
        title="Repor a demonstração?"
        description="Todas as alterações feitas nesta sessão (escalas, horas, obras, documentos) são substituídas pelos dados iniciais."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Manter alterações
            </Button>
            <Button
              variant="danger"
              icon={<RotateCcw className="size-4" />}
              onClick={() => {
                reset()
                setConfirm(false)
                setOpen(false)
                navigate(ROLE_HOME[role])
                toast.success('Demonstração reposta', { description: 'Os dados voltaram ao estado inicial.' })
              }}
            >
              Repor dados
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Não é possível anular esta operação.</p>
      </Dialog>
    </>
  )
}
