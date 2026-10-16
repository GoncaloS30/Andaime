import { AlertTriangle, Bell, Check, Inbox, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { SERIES } from '@/domain/palette'
import type { SiteMetrics } from '@/domain/siteMetrics'
import { Avatar } from '@/ui/Avatar'
import { Badge, Kbd, Plate, SiteCode } from '@/ui/Badge'
import { Button, IconButton } from '@/ui/Button'
import { Checkbox, ChipToggle, Field, Input, Segmented, Select, Switch, Textarea } from '@/ui/Field'
import { GaugeLegend, HoursGauge, HoursStatus } from '@/ui/HoursGauge'
import { PageHeader, Panel } from '@/ui/Layout'
import { Dialog, Drawer } from '@/ui/Overlay'
import { EmptyState, ErrorState, SkeletonRows } from '@/ui/States'

const TOKENS: [string, string, string][] = [
  ['Pinho', '#13342a', 'Estrutura, realizado aprovado, botão principal'],
  ['Musgo', '#24543f', 'Hover sobre Pinho'],
  ['Realizado', '#6f9a84', 'Horas realizadas por aprovar'],
  ['Cal', '#f5f5f0', 'Fundo da aplicação'],
  ['Betão · tinta', '#1f2421', 'Texto principal (15,8:1)'],
  ['Betão · 2', '#545b56', 'Texto secundário (7:1)'],
  ['Betão · 3', '#666d68', 'Texto de apoio (5,3:1)'],
  ['Lima', '#c8e26a', 'Acento: hoje, seleção, foco em fundo escuro. Nunca texto em branco'],
  ['Âmbar', '#c98a12', 'Aviso (preenchimento) · texto #7f5505'],
  ['Tijolo', '#b03a2e', 'Erro e destrutivo (6:1 com branco)'],
  ['Aço', '#3b6a8c', 'Informação'],
  ['Ok', '#2e7550', 'Sucesso'],
]

const m = (p: Partial<SiteMetrics>): SiteMetrics => ({ limit: 1000, realized: 500, approved: 400, plannedFuture: 150, balance: 500, projection: 650, pctRealized: 0.5, pctProjection: 0.65, status: 'normal', overBy: 0, ...p })

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel title={title} className="mb-4">
      {children}
    </Panel>
  )
}

/** Galeria viva do design system Andaime (ver docs/design-system.md). */
export function DesignPage() {
  const [seg, setSeg] = useState<'semana' | 'mes'>('semana')
  const [sw, setSw] = useState(true)
  const [chip, setChip] = useState(true)
  const [drawer, setDrawer] = useState(false)
  const [dialog, setDialog] = useState(false)
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader eyebrow="Design system" title="Andaime" description="Tokens, componentes e estados. Tracejado = planeado; sólido = realizado; a linha é o limite." />
      <Section title="Cores">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TOKENS.map(([n, hex, use]) => (
            <li key={n} className="flex items-center gap-3">
              <span className="size-10 shrink-0 rounded-md border border-line" style={{ background: hex }} aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{n} <span className="font-mono text-xs font-normal text-ink-3">{hex}</span></span>
                <span className="block text-xs text-ink-3">{use}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 mb-2 text-xs font-semibold text-ink-3">Paleta das obras (validada: CVD, contraste, separação)</p>
        <div className="flex flex-wrap gap-1.5">{SERIES.map((c) => <span key={c} title={c} className="h-6 w-10 rounded-xs" style={{ background: c }} />)}</div>
      </Section>
      <Section title="Tipografia — Archivo em três larguras">
        <p className="font-expanded text-3xl font-semibold tracking-tight">Expandida · títulos e números</p>
        <p className="mt-2 text-md">Normal · corpo de texto, formulários e tabelas. 14 px base, interlinha 1,3.</p>
        <p className="mt-2 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-3">Condensada · cabeçalhos densos do quadro</p>
        <p className="mt-2 font-mono text-sm tabular">JetBrains Mono · OB-25-012 · AT-41-RQ · 1 565 h</p>
        <div className="mt-3 flex flex-wrap items-end gap-4 text-ink-2">
          {[
            ['xs · 12', 'text-xs'], ['sm · 13', 'text-sm'], ['base · 14', 'text-base'], ['md · 16', 'text-md'],
            ['lg · 20', 'text-lg'], ['xl · 24', 'text-xl'], ['2xl · 32', 'text-2xl'], ['3xl · 44', 'text-3xl'],
          ].map(([l, c]) => <span key={l} className={c}>{l}</span>)}
        </div>
      </Section>
      <Section title="Botões">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={<Plus className="size-4" />}>Principal</Button>
          <Button>Secundário</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="accent">Acento</Button>
          <Button variant="danger" icon={<Trash2 className="size-4" />}>Remover</Button>
          <Button variant="primary" loading>A guardar</Button>
          <Button disabled>Indisponível</Button>
          <IconButton label="Notificações"><Bell className="size-4" /></IconButton>
          <Button size="sm">Pequeno</Button>
          <Button size="lg" variant="primary">Grande (telemóvel)</Button>
        </div>
      </Section>
      <Section title="Campos">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome da obra" hint="Ajuda abaixo do campo.">{(p) => <Input {...p} placeholder="Ex.: Armazém Maia Norte" />}</Field>
          <Field label="Limite de horas" error="Indique um número maior que zero.">{(p) => <Input {...p} defaultValue="-3" />}</Field>
          <Field label="País">{(p) => <Select {...p}><option>Portugal</option><option>França</option></Select>}</Field>
          <Field label="Nota" optional>{(p) => <Textarea {...p} />}</Field>
          <Switch label="Guardar neste navegador" description="Interruptor acessível (role=switch)." checked={sw} onChange={setSw} />
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Escala" value={seg} onChange={setSeg} options={[{ value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }]} />
            <ChipToggle pressed={chip} onClick={() => setChip(!chip)}>Seg 19</ChipToggle>
            <Checkbox label="Selecionar" defaultChecked />
          </div>
        </div>
      </Section>
      <Section title="Emblemas e identificadores">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="ok" dot>Aprovada</Badge>
          <Badge tone="warn" dot>Por aprovar</Badge>
          <Badge tone="danger" dot>Expirado</Badge>
          <Badge tone="info" dot>Em curso</Badge>
          <Badge tone="accent">Novo</Badge>
          <Badge dot>Planeado</Badge>
          <SiteCode code="OB-25-012" color={SERIES[2]} />
          <Plate plate="AT-41-RQ" />
          <Avatar name="Marta Albuquerque" />
          <Kbd>Ctrl</Kbd><Kbd>K</Kbd>
        </div>
      </Section>
      <Section title="Assinatura — medidor de horas">
        <div className="grid gap-5 sm:grid-cols-2">
          {[
            ['Dentro do limite', m({})],
            ['Atenção (≥ 85 %)', m({ realized: 760, approved: 600, plannedFuture: 120, projection: 880, pctProjection: 0.88, status: 'atencao' })],
            ['Excede o limite', m({ realized: 960, approved: 900, plannedFuture: 110, projection: 1070, pctProjection: 1.07, status: 'excede', overBy: 70 })],
            ['Sem limite', m({ limit: null, status: 'sem_limite', balance: null })],
          ].map(([t, mm]) => (
            <div key={t as string}>
              <p className="mb-1.5 text-sm font-medium">{t as string}</p>
              <HoursGauge m={mm as SiteMetrics} />
              <HoursStatus m={mm as SiteMetrics} className="mt-1 block" />
            </div>
          ))}
        </div>
        <GaugeLegend className="mt-4" />
      </Section>
      <Section title="Sobreposições e notificações">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDrawer(true)}>Abrir painel lateral</Button>
          <Button onClick={() => setDialog(true)}>Abrir diálogo</Button>
          <Button onClick={() => toast.success('Escala guardada', { description: '12 atribuições criadas.', action: { label: 'Anular', onClick: () => undefined } })} icon={<Check className="size-4" />}>Toast de sucesso</Button>
          <Button onClick={() => toast.error('Não foi possível exportar. Tente de novo.')} icon={<AlertTriangle className="size-4" />}>Toast de erro</Button>
        </div>
        <Drawer open={drawer} onOpenChange={setDrawer} title="Painel lateral" description="Em telemóvel passa a folha inferior. Esc fecha e o foco regressa." footer={<Button variant="primary" onClick={() => setDrawer(false)}>Concluir</Button>}>
          <p className="text-sm">Conteúdo do painel.</p>
        </Drawer>
        <Dialog open={dialog} onOpenChange={setDialog} size="sm" title="Remover 3 atribuições?" description="Pode anular logo a seguir." footer={<><Button variant="ghost" onClick={() => setDialog(false)}>Manter</Button><Button variant="danger" onClick={() => setDialog(false)}>Remover atribuições</Button></>}>
          <p className="text-sm text-ink-2">Os botões dizem o que fazem.</p>
        </Dialog>
      </Section>
      <Section title="Estados">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-md border border-dashed border-line"><EmptyState icon={<Inbox />} title="Nada por tratar" action={<Button size="sm">Criar</Button>}>O que é, porque está vazio e como começar.</EmptyState></div>
          <div className="rounded-md border border-line"><ErrorState onRetry={() => toast('A tentar de novo')}>O que falhou e como resolver.</ErrorState></div>
          <div className="rounded-md border border-line"><SkeletonRows rows={4} /></div>
        </div>
      </Section>
      <Section title="Movimento">
        <p className="text-sm text-ink-2">Uma curva (<code className="font-mono text-xs">cubic-bezier(.2,.7,.2,1)</code>) e três durações: 120 ms (botões), 180 ms (popovers, toasts), 260 ms (drawers, folhas). Com <em>prefers-reduced-motion</em> tudo passa a instantâneo e as contagens dos indicadores desligam-se.</p>
      </Section>
    </div>
  )
}
