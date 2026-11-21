import clsx from 'clsx'
import { ArrowUp, CalendarDays, Check, Gavel, Inbox, Lock, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ListaAvvisi } from '../componenti/Avvisi'
import { ProposteACassetti } from '../componenti/Proposte'
import { TodoOggi } from '../componenti/Todo'
import { Card, FoglioCalendario, IntestazioneCard, LinkSobrio, MarchioBrain, Scheletro, Vuoto } from '../componenti/ui'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { daChiarire, dataLunga, giorniA, scadenzaRelativa } from '../lib'
import type { Task } from '../tipi'

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

  const [frase, dettaglio] = sonoManager
    ? inAttesa.length || aperti.length
      ? ['Ho letto le riunioni del progetto.', `Ci sono ${inAttesa.length} proposte da approvare e ${aperti.length} punti da chiarire prima di andare avanti.`]
      : ['Nessuna decisione in sospeso.', 'La memoria del progetto è aggiornata.']
    : attivi.length
      ? ['La tua giornata è pronta.', `Hai ${attivi.length} task aperti${inScadenza.length ? `, ${inScadenza.length} in scadenza questa settimana` : ''}${bloccati.length ? `, ${bloccati.length} bloccati` : ''}.`]
      : ['Non hai task aperti al momento.', 'Quando il manager approva nuovi task per te, li trovi qui.']
  const haDaDire = sonoManager ? inAttesa.length + aperti.length > 0 : aperti.length + inScadenza.length + bloccati.length > 0

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[13px] font-semibold text-testo-2 first-letter:uppercase">{dataLunga(new Date())}</p>
        <h1 className="titolo-grande mt-1 text-[34px] sm:text-[40px]">{saluto}, {io.nome.split(' ')[0]}</h1>
      </div>

      {/* il Brain parla per primo */}
      <section aria-label="Il Brain ti dice" className={clsx('alone', !haDaDire && 'alone-spento')}>
        <div className="rounded-[22.5px] bg-superficie">
          <div className="flex items-start gap-3.5 px-5 pt-5 sm:px-6">
            <MarchioBrain size={38} parla={haDaDire} />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold tracking-[-0.01em]">{frase}</p>
              <p className="mt-0.5 text-[15px] text-testo-2">{dettaglio}</p>
            </div>
          </div>
          <ListaAvvisi griglia />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {sonoManager ? (
          <>
            <Widget icona={Check} colore="bg-accento" valore={inAttesa.length} etichetta="Proposte da decidere" a="/documenti" />
            <Widget testoIcona="?" colore="bg-arancio" valore={aperti.length} etichetta="Punti da chiarire" a="/" />
          </>
        ) : (
          <>
            <Widget icona={Check} colore="bg-accento" valore={attivi.length} etichetta="I tuoi task aperti" a="/team" />
            <Widget testoIcona="!" colore="bg-arancio" valore={aperti.length} etichetta="Avvisi per te" a="/" />
          </>
        )}
        <Widget icona={CalendarDays} colore="bg-viola" valore={inScadenza.length} etichetta="In scadenza entro 7 giorni" a="/team" />
        <Widget icona={Lock} colore="bg-rosso" valore={bloccati.length} etichetta="Task bloccati" a="/team" allarme />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {sonoManager ? (
            <Card>
              <IntestazioneCard icona={Gavel} titolo="Da decidere"
                sottotitolo="Il Brain propone, tu decidi. Niente entra nella memoria senza la tua approvazione."
                azioni={<LinkSobrio a="/documenti">Per documento</LinkSobrio>} />
              {!pronto ? <Scheletro /> : proposte.length === 0
                ? <Vuoto icona={Inbox} titolo="Nessuna proposta" testo="Carica una riunione: il Brain la legge e ti propone task e fatti." />
                : <ProposteACassetti proposte={proposte} mostraDocumento />}
            </Card>
          ) : (
            <TodoOggi />
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <IntestazioneCard icona={CalendarDays} titolo="Prossime scadenze"
              sottotitolo={sonoManager ? 'Tutti i task approvati del progetto' : 'I task del progetto che puoi vedere'}
              azioni={<LinkSobrio a="/team">Gantt</LinkSobrio>} />
            {!pronto ? <Scheletro righe={2} /> : (
              <ul className="pb-2">
                {[...task].filter((t) => t.stato !== 'fatto' && t.stato !== 'annullato')
                  .sort((a, b) => (a.scadenza ?? '9').localeCompare(b.scadenza ?? '9')).slice(0, 5)
                  .map((t) => <RigaScadenza key={t.id} t={t} />)}
              </ul>
            )}
          </Card>
          <DomandaRapida />
        </div>
      </div>
    </div>
  )
}

function Widget({ icona: Icona, testoIcona, colore, valore, etichetta, a, allarme }: {
  icona?: LucideIcon; testoIcona?: string; colore: string; valore: number; etichetta: string; a: string; allarme?: boolean
}) {
  return (
    <Link to={a} className="group flex flex-col gap-4 rounded-scheda bg-superficie p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-alta">
      <span className={clsx('grid h-8 w-8 place-items-center rounded-full text-[15px] font-bold text-white', colore)}>
        {Icona ? <Icona size={16} strokeWidth={2.4} /> : testoIcona}
      </span>
      <span>
        <span className={clsx('cifre block text-[34px] leading-none font-bold tracking-[-0.03em]', allarme && valore > 0 && 'text-rosso-testo', !valore && 'text-testo-3')}>{valore}</span>
        <span className="mt-1.5 block text-[13px] text-testo-2">{etichetta}</span>
      </span>
    </Link>
  )
}

function RigaScadenza({ t }: { t: Task }) {
  const { persone } = useApp()
  const { task } = useDati()
  const chi = t.assegnatario_id ? persone[t.assegnatario_id] : null
  const { testo, tono } = scadenzaRelativa(t.scadenza, t.stato)
  const bloccanti = t.dipende_da.map((id) => task.find((x) => x.id === id)).filter(Boolean) as Task[]
  return (
    <li className="flex items-center gap-3.5 px-5 py-2.5">
      <FoglioCalendario iso={t.scadenza} urgente={tono === 'rosso' || tono === 'giallo'} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{t.titolo}</p>
        {bloccanti.length > 0 ? (
          <p className="flex items-center gap-1.5 text-[13px] text-rosso-testo">
            <Lock size={12} strokeWidth={2.4} className="shrink-0" />
            <span className="truncate">Aspetta: {bloccanti.map((b) => b.titolo).join(', ')}</span>
          </p>
        ) : (
          <p className="truncate text-[13px] text-testo-2">{chi?.nome ?? 'Nessun responsabile'}, {testo}</p>
        )}
      </div>
    </li>
  )
}

function DomandaRapida() {
  const [testo, setTesto] = useState('')
  const vai = useNavigate()
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5">
        <MarchioBrain size={24} />
        <h2 className="text-[17px] font-semibold">Chiedi al Brain</h2>
      </div>
      <p className="mt-1.5 text-sm text-testo-2">Risponde solo con ciò che è approvato e che puoi vedere, e ti dice da dove lo sa.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (testo.trim()) vai('/chiedi', { state: { domanda: testo } }) }}
        className="mt-4 flex h-11 items-center gap-2 rounded-full bg-riempimento pr-1.5 pl-4 focus-within:ring-3 focus-within:ring-accento/30">
        <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Quanto budget resta?" aria-label="Domanda per il Brain"
          className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-testo-3 focus:outline-none" />
        <button disabled={!testo.trim()} aria-label="Chiedi"
          className="grid h-8 w-8 place-items-center rounded-full bg-accento text-su-accento transition hover:bg-accento-premuto disabled:opacity-35">
          <ArrowUp size={16} strokeWidth={2.6} />
        </button>
      </form>
      <Link to="/chiedi" className="mt-3 inline-block text-sm text-accento-testo hover:underline">Apri la conversazione</Link>
    </Card>
  )
}
