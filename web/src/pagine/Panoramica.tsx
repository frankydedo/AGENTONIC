import clsx from 'clsx'
import { BellRing, CalendarClock, CornerDownLeft, Gavel, Inbox } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ListaAvvisi } from '../componenti/Avvisi'
import { CartaProposta } from '../componenti/Proposte'
import { RigaTask, TodoOggi } from '../componenti/Todo'
import { Card, IntestazioneCard, LinkSobrio, MarchioBrain, Scheletro, Vuoto } from '../componenti/ui'
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
      ? `Ho ${inAttesa.length} proposte da farti approvare e ${aperti.length} punti da chiarire.`
      : 'Nessuna decisione in sospeso: la memoria del progetto è aggiornata.'
    : attivi.length
      ? `Hai ${attivi.length} task aperti${inScadenza.length ? `, ${inScadenza.length} in scadenza questa settimana` : ''}.`
      : 'Non hai task aperti al momento.'
  const haDaDire = sonoManager ? inAttesa.length + aperti.length > 0 : inScadenza.length + bloccati.length > 0

  return (
    <div className="space-y-8">
      <div className="border-b-2 border-inchiostro pb-6">
        <p className="text-sm font-medium text-grafite first-letter:uppercase">{dataLunga(new Date())}</p>
        <h1 className="titolo-tavola mt-2 text-[2.4rem] sm:text-[3.4rem]">{saluto}, {io.nome.split(' ')[0]}</h1>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <p className="flex max-w-xl items-start gap-3 text-[18px] leading-snug">
            <MarchioBrain size={24} parla={haDaDire} className="mt-0.5" />
            <span>{frase}</span>
          </p>
        <Quadro celle={sonoManager
          ? [
            { etichetta: 'Proposte da decidere', valore: inAttesa.length, a: '/documenti', attenzione: true },
            { etichetta: 'Punti da chiarire', valore: aperti.length, a: '/', attenzione: true },
            { etichetta: 'In scadenza entro 7 giorni', valore: inScadenza.length, a: '/team' },
            { etichetta: 'Task bloccati', valore: bloccati.length, a: '/team', allarme: true },
          ]
          : [
            { etichetta: 'I tuoi task aperti', valore: attivi.length, a: '/team' },
            { etichetta: 'Avvisi per te', valore: aperti.length, a: '/', attenzione: true },
            { etichetta: 'In scadenza entro 7 giorni', valore: inScadenza.length, a: '/team' },
            { etichetta: 'Task bloccati', valore: bloccati.length, a: '/team', allarme: true },
          ]} />
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          {sonoManager ? (
            <Card>
              <IntestazioneCard icona={Gavel} titolo="Da decidere"
                sottotitolo="Il Brain propone, tu decidi. Niente entra nella memoria senza la tua approvazione."
                azioni={<LinkSobrio a="/documenti">Per documento</LinkSobrio>} />
              {!pronto ? <Scheletro /> : inAttesa.length === 0
                ? <Vuoto icona={Inbox} titolo="Nessuna proposta in attesa" testo="Carica una riunione dalla pagina Documenti: il Brain la legge e ti propone task e fatti." />
                : <ul className="space-y-3 p-4">{inAttesa.map((p) => <CartaProposta key={p.id} p={p} mostraDocumento />)}</ul>}
            </Card>
          ) : (
            <TodoOggi />
          )}
          <Card>
            <IntestazioneCard icona={CalendarClock} titolo="Prossime scadenze"
              sottotitolo={sonoManager ? 'Tutti i task approvati del progetto' : 'I task del progetto che puoi vedere'}
              azioni={<LinkSobrio a="/team">Apri il Gantt</LinkSobrio>} />
            {!pronto ? <Scheletro righe={2} /> : (
              <ul className="divide-y divide-linea">
                {[...task].filter((t) => t.stato !== 'fatto').sort((a, b) => (a.scadenza ?? '9').localeCompare(b.scadenza ?? '9')).slice(0, 5)
                  .map((t) => <li key={t.id} className="px-5 py-3.5"><RigaTask t={t} compatta /></li>)}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-8">
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

interface CellaQuadro { etichetta: string; valore: number; a: string; attenzione?: boolean; allarme?: boolean }

/** Il quadro dei contatori: una sola strumentazione, le celle accese solo quando c'è qualcosa da fare. */
function Quadro({ celle }: { celle: CellaQuadro[] }) {
  return (
    <div className="grid grid-cols-2 gap-[1.5px] overflow-hidden rounded-[4px] border-[1.5px] border-inchiostro bg-inchiostro sm:grid-cols-4 lg:w-[34rem]">
      {celle.map((c) => {
        const acceso = c.valore > 0 && (c.attenzione || c.allarme)
        return (
          <Link key={c.etichetta} to={c.a}
            className="group relative flex min-h-[104px] flex-col justify-between bg-foglio p-3 transition-colors hover:bg-velina">
            <span className={clsx('condensato text-[2.9rem] leading-none font-bold',
              acceso && c.allarme ? 'text-allarme' : !c.valore && 'text-traccia')}>
              {c.valore}
            </span>
            <span className="mt-2 text-[12.5px] leading-tight text-grafite">{c.etichetta}</span>
            {acceso && <span aria-hidden className={clsx('absolute top-3 right-3 h-2 w-2 rounded-full', c.allarme ? 'bg-allarme' : 'animate-spia bg-segnale')} />}
          </Link>
        )
      })}
    </div>
  )
}

function DomandaRapida() {
  const [testo, setTesto] = useState('')
  const vai = useNavigate()
  return (
    <section className="rounded-md bg-inchiostro p-5 text-foglio">
      <div className="flex items-center gap-2.5">
        <MarchioBrain size={22} className="bg-foglio/10" />
        <h2 className="text-[17px] font-bold [font-stretch:108%]">Chiedi al Brain</h2>
      </div>
      <p className="mt-2 text-sm text-foglio/70">Risponde solo con ciò che è approvato e che puoi vedere, e ti dice da dove lo sa.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (testo.trim()) vai('/chiedi', { state: { domanda: testo } }) }}
        className="mt-4 flex items-center gap-2 rounded-[4px] border border-foglio/25 bg-foglio/5 p-1 focus-within:border-segnale">
        <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Es. quanto budget resta?" aria-label="Domanda per il Brain"
          className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-sm text-foglio placeholder:text-foglio/45 focus:outline-none" />
        <button className="grid h-8 w-8 place-items-center rounded-[3px] bg-segnale text-inchiostro hover:brightness-105" aria-label="Chiedi">
          <CornerDownLeft size={16} strokeWidth={2.4} />
        </button>
      </form>
      <Link to="/chiedi" className="mt-3 inline-block text-sm font-medium text-foglio/80 underline decoration-foglio/30 underline-offset-4 hover:text-foglio">
        Apri la conversazione
      </Link>
    </section>
  )
}
