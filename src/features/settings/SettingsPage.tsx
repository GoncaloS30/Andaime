import { RotateCcw, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { DEMO_LABEL } from '@/copy'
import { persistEnabled, setPersistEnabled, saveSnapshot } from '@/store/persistence'
import { demoStore, useDemo } from '@/store/store'
import { Button } from '@/ui/Button'
import { Field, Input, Switch } from '@/ui/Field'
import { PageHeader, Panel } from '@/ui/Layout'
import { Dialog } from '@/ui/Overlay'

/** Definições da demonstração: regras de horas, códigos ERP, persistência e estados simulados. */
export function SettingsPage() {
  const settings = useDemo((s) => s.session.settings)
  const flags = useDemo((s) => s.session.flags)
  const seededAt = useDemo((s) => s.session.seededAt)
  const today = useDemo((s) => s.session.today)
  const setSettings = useDemo((s) => s.setSettings)
  const setFlag = useDemo((s) => s.setFlag)
  const reset = useDemo((s) => s.resetDemo)
  const [f, setF] = useState(settings)
  const [persist, setPersist] = useState(persistEnabled())
  const [confirm, setConfirm] = useState(false)
  const dirty = JSON.stringify(f) !== JSON.stringify(settings)

  return (
    <div className="mx-auto max-w-[880px]">
      <PageHeader title="Definições" description={`${DEMO_LABEL}. Estas opções existem para demonstrar o produto e só afetam este navegador.`} />
      <div className="flex flex-col gap-4">
        <Panel title="Regras de horas" description="Usadas no cálculo de normais/extra, nas métricas das obras e nas exportações.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Horas normais por dia útil" hint="Acima disto conta como extra. Fins de semana são sempre extra.">
              {(p) => <Input {...p} type="number" min={6} max={10} step={0.5} value={f.dailyNormal} onChange={(e) => setF({ ...f, dailyNormal: Number(e.target.value) })} />}
            </Field>
            <Field label="Pausa por defeito (min)" hint="Descontada em horários acima de 6 h.">
              {(p) => <Input {...p} type="number" min={0} max={120} step={5} value={f.defaultBreak} onChange={(e) => setF({ ...f, defaultBreak: Number(e.target.value) })} />}
            </Field>
          </div>
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-medium">Códigos de atividade (exportação ERP)</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Até 8 h">{(p) => <Input {...p} value={f.activityCodes.normal} onChange={(e) => setF({ ...f, activityCodes: { ...f.activityCodes, normal: e.target.value } })} />}</Field>
              <Field label="Até 9 h">{(p) => <Input {...p} value={f.activityCodes.ate9} onChange={(e) => setF({ ...f, activityCodes: { ...f.activityCodes, ate9: e.target.value } })} />}</Field>
              <Field label="Acima de 9 h / fim de semana">{(p) => <Input {...p} value={f.activityCodes.extra} onChange={(e) => setF({ ...f, activityCodes: { ...f.activityCodes, extra: e.target.value } })} />}</Field>
            </div>
          </fieldset>
          <Button className="mt-4" variant="primary" disabled={!dirty} onClick={() => { setSettings(f); toast.success('Definições guardadas', { description: 'Horas, métricas e exportações já usam as novas regras.' }) }}>
            Guardar definições
          </Button>
        </Panel>

        <Panel title="Dados da demonstração">
          <div className="flex flex-col gap-4">
            <Switch
              label="Guardar neste navegador"
              description="Mantém as alterações ao recarregar. Desligado: tudo fica em memória e desaparece ao fechar."
              checked={persist}
              onChange={(v) => { setPersist(v); setPersistEnabled(v); if (v) { const s = demoStore.getState(); saveSnapshot(s.db, s.session) } }}
            />
            <Switch label="Simular empresa sem dados" description="Mostra os estados vazios de cada módulo." checked={flags.emptyCompany} onChange={(v) => setFlag('emptyCompany', v)} />
            <Switch label="Simular falha de ligação" description="Mostra os estados de erro de cada módulo." checked={flags.simulateError} onChange={(v) => setFlag('simulateError', v)} />
            <p className="text-xs text-ink-3">
              Dados gerados para {today} ({new Date(seededAt).toLocaleString('pt-PT')}). Sem servidor, sem autenticação e sem envio de dados.
            </p>
            <div>
              <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={() => setConfirm(true)}>Repor demonstração</Button>
            </div>
          </div>
        </Panel>
      </div>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        size="sm"
        title="Repor a demonstração?"
        description="Todas as alterações são substituídas pelos dados iniciais, gerados para hoje."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Manter alterações</Button>
            <Button variant="danger" icon={<Settings2 className="size-4" />} onClick={() => { reset(); setF(demoStore.getState().session.settings); setConfirm(false); toast.success('Demonstração reposta') }}>Repor dados</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Não é possível anular esta operação.</p>
      </Dialog>
    </div>
  )
}
