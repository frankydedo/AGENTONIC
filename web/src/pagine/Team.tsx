import clsx from 'clsx'
import { ChartGantt, Sun, Users } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Gantt } from '../componenti/Gantt'
import { RigaTask, useTodoOggi } from '../componenti/Todo'
import { Avatar, Badge, Card, ChipArea, Scheletro, TitoloPagina } from '../componenti/ui'
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
        titolo="Team e scadenze"
        sottotitolo={sonoManager ? 'Chi fa cosa, entro quando, e cosa blocca chi.' : 'I task del progetto che rientrano nelle tue competenze.'}
        azioni={
          <div className="flex items-center gap-2">
            <select value={chi} onChange={(e) => imposta('chi', e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="">Tutte le persone</option>
              {membri.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <div className="flex rounded-lg bg-slate-100 p-1">
              {([['gantt', 'Gantt', ChartGantt], ['persone', 'Per persona', Users]] as const).map(([k, etichetta, Icona]) => (
                <button key={k} onClick={() => imposta('vista', k === 'gantt' ? '' : k)}
                  className={clsx('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
                    vista === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
                  <Icona size={15} /> {etichetta}
                </button>
              ))}
            </div>
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
      <div className="flex items-start gap-3 border-b border-slate-100 p-5">
        <Avatar persona={p} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{p.nome}</p>
          <p className="text-sm text-slate-500">{p.id === progetto.manager_id ? 'Manager del progetto' : p.ruolo}</p>
          <div className="mt-2 flex flex-wrap gap-1">{p.competenze.map((a) => <ChipArea key={a} area={a} />)}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 text-center">
        <Numero n={aperti.length} etichetta="aperti" />
        <Numero n={urgenti} etichetta="entro 7 gg" tono={urgenti ? 'text-amber-600' : undefined} />
        <Numero n={bloccati} etichetta="bloccati" tono={bloccati ? 'text-red-600' : undefined} />
      </div>
      <div className="flex-1 space-y-4 p-5">
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <Sun size={13} /> Oggi
            {todo && (stimata
              ? <Badge className="ml-auto normal-case" tono="grigio">stimata dai task</Badge>
              : todo.accettata ? <Badge className="ml-auto normal-case" tono="verde">accettata</Badge> : <Badge className="ml-auto normal-case" tono="giallo">da accettare</Badge>)}
          </h3>
          {!todo ? <div className="h-10 animate-pulse rounded-lg bg-slate-100" /> : todo.task.length === 0
            ? <p className="text-sm text-slate-400">Niente in programma.</p>
            : <ul className="space-y-2">{todo.task.map((t) => <li key={t.id} className="rounded-lg bg-slate-50 p-2.5"><RigaTask t={t} conAssegnatario={false} compatta /></li>)}</ul>}
        </section>
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Tutti i suoi task</h3>
          {suoi.length === 0 ? <p className="text-sm text-slate-400">Nessun task visibile.</p>
            : <ul className="space-y-2">{suoi.map((t) => <li key={t.id} className="rounded-lg border border-slate-100 p-2.5"><RigaTask t={t} conAssegnatario={false} compatta /></li>)}</ul>}
        </section>
      </div>
    </Card>
  )
}

function Numero({ n, etichetta, tono }: { n: number; etichetta: string; tono?: string }) {
  return (
    <div className="py-3">
      <p className={clsx('text-xl font-semibold tabular-nums', tono)}>{n}</p>
      <p className="text-[11px] text-slate-500">{etichetta}</p>
    </div>
  )
}
