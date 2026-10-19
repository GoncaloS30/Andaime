import { AlertOctagon, AlertTriangle } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Overlay'
import { errorMessage, isApiError } from '../../api/http'
import { conflictsOf, useCommand, useRevert, type Command, type CommandResult, type Conflict } from '../../api/planning'

/** Lista de conflitos com ícone e texto (nunca só cor). */
export function ConflictList({ conflicts, children }: { conflicts: Conflict[]; children?: (c: Conflict) => ReactNode }) {
  return (
    <ul className="flex flex-col gap-2">
      {conflicts.map((c) => (
        <li key={c.id} className="flex gap-2 rounded-sm border border-line-2 p-2.5">
          {c.severity === 'BLOCK' ? (
            <AlertOctagon aria-label="Bloqueante" className="mt-0.5 size-4 shrink-0 text-tijolo" />
          ) : (
            <AlertTriangle aria-label="Aviso" className="mt-0.5 size-4 shrink-0 text-ambar-ink" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{c.title}</p>
            <p className="text-sm text-ink-3">{c.explanation}</p>
            {children?.(c)}
          </div>
        </li>
      ))}
    </ul>
  )
}

interface Pending {
  command: Command
  conflicts: Conflict[]
  resolve: (result: CommandResult | null) => void
}

/**
 * Executa comandos de planeamento. Avisos novos pedem confirmação explícita (o servidor exige os ids);
 * conflitos bloqueantes mostram a explicação. Cada alteração gravada oferece "Anular".
 */
export function usePlanningCommands(orgId: string) {
  const command = useCommand(orgId)
  const revert = useRevert(orgId)
  const [pending, setPending] = useState<Pending | null>(null)

  const announce = useCallback(
    (result: CommandResult, success?: string) => {
      const parts = [result.created && `${result.created} criada(s)`, result.updated && `${result.updated} alterada(s)`, result.deleted && `${result.deleted} retirada(s)`].filter(Boolean)
      const skipped = result.skipped.length ? ` · ${result.skipped.length} ignorada(s)` : ''
      toast.success(success ?? result.label, {
        description: `${parts.join(', ') || 'Sem alterações'}${skipped}`,
        action: result.changeSetId
          ? {
              label: 'Anular',
              onClick: () =>
                revert.mutate(result.changeSetId!, {
                  onSuccess: () => toast.success('Alteração anulada'),
                  onError: (e) => toast.error(errorMessage(e)),
                }),
            }
          : undefined,
      })
    },
    [revert],
  )

  const run = useCallback(
    (cmd: Command, success?: string): Promise<CommandResult | null> =>
      new Promise((resolve) => {
        command.mutate(cmd, {
          onSuccess: (result) => {
            announce(result, success)
            resolve(result)
          },
          onError: (error) => {
            if (isApiError(error, 'confirmation-required')) {
              setPending({ command: cmd, conflicts: conflictsOf(error), resolve })
              return
            }
            const conflicts = conflictsOf(error)
            toast.error(conflicts[0]?.title ?? errorMessage(error), { description: conflicts[0]?.explanation })
            resolve(null)
          },
        })
      }),
    [command, announce],
  )

  const confirm = () => {
    const p = pending
    if (!p) return
    const acks = [...(p.command.acknowledgedConflictIds ?? []), ...p.conflicts.map((c) => c.id)]
    setPending(null)
    void run({ ...p.command, acknowledgedConflictIds: acks }).then(p.resolve)
  }

  const cancel = () => {
    pending?.resolve(null)
    setPending(null)
  }

  const dialog = (
    <Dialog
      open={!!pending}
      onOpenChange={(o) => !o && cancel()}
      title="Confirmar com avisos"
      description="A alteração é possível, mas cria estes avisos. Confirme se é mesmo isto que pretende."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={cancel}>
            Voltar
          </Button>
          <Button variant="primary" onClick={confirm} loading={command.isPending}>
            Confirmar e gravar
          </Button>
        </div>
      }
    >
      {pending && <ConflictList conflicts={pending.conflicts} />}
    </Dialog>
  )

  return { run, dialog, busy: command.isPending || revert.isPending, revert }
}
