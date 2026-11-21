import clsx from 'clsx'
import { ChartGantt, Sun, Users } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Gantt } from '../componenti/Gantt'
import { RigaTask, useTodoOggi } from '../componenti/Todo'
import { Avatar, Badge, Card, ChipArea, Scheletro, Segmentato, TitoloPagina } from '../componenti/ui'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { giorniA } from '../lib'
import type { Persona } from '../tipi'

export function Team() {
  const { membri, sonoManager } = useApp()
  const { task, pronto } = useDati()
  const [params, setParams] = useSearchParams()
  const vista = params.get('vista') === 'persone' ? 'persone' : 'gantt'
  const chi = params.get('chi') ?? ''
  const imposta = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }) }

  return (
    <>
      <TitoloPagina
        titolo="Team & deadlines"
        sottotitolo={sonoManager ? 'Who does what, by when, and what is blocking whom.' : 'The project tasks within your areas.'}
        azioni={
          <div className="flex items-center gap-2">
            <select value={chi} onChange={(e) => imposta('chi', e.target.value)} aria-label="Filter by person" className="h-9 rounded-full bg-riempimento-2/80 pr-8 pl-3.5 text-sm font-medium text-testo focus:ring-3 focus:ring-accento/30 focus:outline-none">
              <option value="">Everyone</option>
              {membri.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <Segmentato etichetta="View" valore={vista} onCambia={(k) => imposta('vista', k === 'gantt' ? '' : k)}
              opzioni={[['gantt', 'Gantt', ChartGantt], ['persone', 'By person', Users]] as const} />
          </div>
        }
      />
      {!pronto ? <Card><Scheletro righe={5} /></Card> : vista === 'gantt' ? (
        <Card className="overflow-hidden"><Gantt task={task} filtro={chi || undefined} /></Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
          {membri.filter((m) => !chi || m.id === chi).map((m) => <CartaPersona key={m.id} p={m} />)}
        </div>
      )}
    </>
  )
}

function CartaPersona({ p }: { p: Persona }) {
  const { progetto } = useApp()
  const { task } = useDati()
  const { todo, stimata } = useTodoOggi(p.id)
  const suoi = task.filter((t) => t.assegnatario_id === p.id).sort((a, b) => (a.scadenza ?? '9').localeCompare(b.scadenza ?? '9'))
  const aperti = suoi.filter((t) => t.stato !== 'fatto' && t.stato !== 'annullato')
  const urgenti = aperti.filter((t) => t.scadenza && giorniA(t.scadenza) <= 7).length
  const bloccati = aperti.filter((t) => t.stato === 'bloccato').length

  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 p-5 pb-4">
        <Avatar persona={p} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold">{p.nome}</p>
          <p className="text-sm text-testo-2">{p.id === progetto.manager_id ? 'Project manager' : p.ruolo}</p>
          <div className="mt-2 flex flex-wrap gap-1">{p.competenze.map((a) => <ChipArea key={a} area={a} />)}</div>
        </div>
      </div>
      <div className="mx-5 grid grid-cols-3 gap-2">
        <Numero n={aperti.length} etichetta="open" />
        <Numero n={urgenti} etichetta="within 7 days" tono={urgenti ? 'text-arancio-testo' : undefined} />
        <Numero n={bloccati} etichetta="blocked" tono={bloccati ? 'text-rosso-testo' : undefined} />
      </div>
      <div className="flex-1 space-y-4 p-5">
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
            <Sun size={13} /> Today
            {todo && (stimata
              ? <Badge className="ml-auto" tono="grigio">estimated from tasks</Badge>
              : todo.accettata ? <Badge className="ml-auto" tono="verde">accepted</Badge> : <Badge className="ml-auto" tono="giallo">to accept</Badge>)}
          </h3>
          {!todo ? <div className="h-10 animate-pulse rounded-lg bg-riempimento" /> : todo.task.length === 0
            ? <p className="text-sm text-testo-3">Nothing planned.</p>
            : <ul className="space-y-2">{todo.task.map((t) => <li key={t.id} className="rounded-2xl bg-accento-tenue/70 px-3.5 py-3"><RigaTask t={t} conAssegnatario={false} compatta /></li>)}</ul>}
        </section>
        <section>
          <h3 className="mb-2 text-sm font-bold">All their tasks</h3>
          {suoi.length === 0 ? <p className="text-sm text-testo-3">No visible tasks.</p>
            : <ul className="space-y-2">{suoi.map((t) => <li key={t.id} className="rounded-2xl bg-riempimento/70 px-3.5 py-3"><RigaTask t={t} conAssegnatario={false} compatta /></li>)}</ul>}
        </section>
      </div>
    </Card>
  )
}

function Numero({ n, etichetta, tono }: { n: number; etichetta: string; tono?: string }) {
  return (
    <div className="rounded-2xl bg-riempimento/70 px-3.5 py-3">
      <p className={clsx('cifre text-[26px] leading-none font-bold tracking-[-0.02em]', !n && 'text-testo-3', tono)}>{n}</p>
      <p className="mt-1 text-xs text-testo-2">{etichetta}</p>
    </div>
  )
}
