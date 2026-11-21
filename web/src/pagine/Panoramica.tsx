import clsx from 'clsx'
import { ArrowRight, BellRing, CalendarClock, Gavel, Inbox, ListTodo, Lock, Send, Sparkles, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ListaAvvisi } from '../componenti/Avvisi'
import { CartaProposta } from '../componenti/Proposte'
import { RigaTask, TodoOggi } from '../componenti/Todo'
import { Card, IntestazioneCard, Scheletro, Vuoto } from '../componenti/ui'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { daChiarire, dataLunga, giorniA } from '../lib'

export function Panoramica() {
  const { io, sonoManager } = useApp()
  const { proposte, avvisi, task, pronto } = useDati()
  const ora = new Date().getHours()
  const saluto = ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera'

  const inAttesa = proposte.filter((p) => p.stato === 'in_attesa').sort((a, b) => Number(daChiarire(b)) - Number(daChiarire(a)))
  const aperti = avvisi.filter((a) => !a.risolto)
  const miei = sonoManager ? task : task.filter((t) => t.assegnatario_id === io.id)
  const attivi = miei.filter((t) => t.stato !== 'fatto' && t.stato !== 'annullato')
  const inScadenza = attivi.filter((t) => t.scadenza && giorniA(t.scadenza) <= 7)
  const bloccati = attivi.filter((t) => t.stato === 'bloccato')

  const frase = sonoManager
    ? inAttesa.length || aperti.length
      ? `Il Brain ha ${inAttesa.length} proposte da farti approvare e ${aperti.length} punti da chiarire.`
      : 'Nessuna decisione in sospeso: la memoria del progetto è aggiornata.'
    : attivi.length
      ? `Hai ${attivi.length} task aperti${inScadenza.length ? `, ${inScadenza.length} in scadenza questa settimana` : ''}.`
      : 'Non hai task aperti al momento.'

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-slate-500 capitalize">{dataLunga(new Date())}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{saluto}, {io.nome.split(' ')[0]}</h1>
        <p className="mt-2 inline-flex items-center gap-2 text-slate-600">
          <Sparkles size={16} className="text-violet-500" /> {frase}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {sonoManager ? (
          <>
            <Tessera icona={Gavel} etichetta="Proposte da decidere" valore={inAttesa.length} a="/documenti" tono="indigo" />
            <Tessera icona={BellRing} etichetta="Punti da chiarire" valore={aperti.length} a="/" tono="amber" />
          </>
        ) : (
          <>
            <Tessera icona={ListTodo} etichetta="I tuoi task aperti" valore={attivi.length} a="/team" tono="indigo" />
            <Tessera icona={BellRing} etichetta="Avvisi per te" valore={aperti.length} a="/" tono="amber" />
          </>
        )}
        <Tessera icona={CalendarClock} etichetta="In scadenza entro 7 giorni" valore={inScadenza.length} a="/team" tono="rose" />
        <Tessera icona={Lock} etichetta="Task bloccati" valore={bloccati.length} a="/team" tono="slate" />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          {sonoManager ? (
            <Card>
              <IntestazioneCard icona={Gavel} titolo="Da decidere"
                sottotitolo="Il Brain propone, tu decidi. Niente entra nella memoria senza la tua approvazione."
                azioni={<Link to="/documenti" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">Per documento →</Link>} />
              {!pronto ? <Scheletro /> : inAttesa.length === 0
                ? <Vuoto icona={Inbox} titolo="Nessuna proposta in attesa" testo="Carica una riunione dalla pagina Documenti: il Brain la legge e ti propone task e fatti." />
                : <ul className="space-y-3 p-5">{inAttesa.map((p) => <CartaProposta key={p.id} p={p} mostraDocumento />)}</ul>}
            </Card>
          ) : (
            <TodoOggi />
          )}
          <Card>
            <IntestazioneCard icona={CalendarClock} titolo="Prossime scadenze"
              sottotitolo={sonoManager ? 'Tutti i task approvati del progetto' : 'I task del progetto che puoi vedere'}
              azioni={<Link to="/team" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">Gantt →</Link>} />
            {!pronto ? <Scheletro righe={2} /> : (
              <ul className="divide-y divide-slate-100">
                {[...task].filter((t) => t.stato !== 'fatto').sort((a, b) => (a.scadenza ?? '9').localeCompare(b.scadenza ?? '9')).slice(0, 5)
                  .map((t) => <li key={t.id} className="px-5 py-3"><RigaTask t={t} compatta /></li>)}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <IntestazioneCard icona={BellRing} titolo="Il Brain ti segnala" sottotitolo="Senza che tu lo chieda" />
            <ListaAvvisi />
          </Card>
          <DomandaRapida />
        </div>
      </div>
    </div>
  )
}

const TONI = {
  indigo: 'from-indigo-500 to-violet-500 shadow-indigo-500/25',
  amber: 'from-amber-400 to-orange-500 shadow-amber-500/25',
  rose: 'from-rose-500 to-pink-500 shadow-rose-500/25',
  slate: 'from-slate-500 to-slate-700 shadow-slate-500/25',
}

function Tessera({ icona: Icona, etichetta, valore, a, tono }: { icona: LucideIcon; etichetta: string; valore: number; a: string; tono: keyof typeof TONI }) {
  return (
    <Link to={a} className="group">
      <Card className="flex items-center gap-4 p-4 transition group-hover:-translate-y-0.5 group-hover:shadow-lg">
        <span className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg', TONI[tono])}>
          <Icona size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-2xl leading-none font-semibold tabular-nums">{valore}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{etichetta}</p>
        </div>
      </Card>
    </Link>
  )
}

function DomandaRapida() {
  const [testo, setTesto] = useState('')
  const vai = useNavigate()
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white">
        <p className="inline-flex items-center gap-2 font-semibold"><Sparkles size={16} /> Chiedi al Brain</p>
        <p className="mt-1 text-sm text-indigo-100">Risponde solo con ciò che è approvato e che puoi vedere, e ti dice da dove lo sa.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (testo.trim()) vai('/chiedi', { state: { domanda: testo } }) }} className="mt-4 flex gap-2">
          <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Es. quanto budget resta?"
            className="min-w-0 flex-1 rounded-lg border-0 bg-white/15 px-3 py-2 text-sm text-white placeholder:text-indigo-200 focus:bg-white/25 focus:ring-2 focus:ring-white/40 focus:outline-none" />
          <button className="grid h-9 w-9 place-items-center rounded-lg bg-white text-indigo-600 hover:bg-indigo-50" aria-label="Chiedi"><Send size={16} /></button>
        </form>
      </div>
      <Link to="/chiedi" className="flex items-center justify-between px-5 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
        Apri la conversazione <ArrowRight size={15} />
      </Link>
    </Card>
  )
}
