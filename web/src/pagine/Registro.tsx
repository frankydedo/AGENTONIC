import clsx from 'clsx'
import { ChevronRight, CircleAlert, ScrollText, UserCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { Avatar, Badge, Card, MarchioBrain, Scheletro, TitoloPagina, Vuoto } from '../componenti/ui'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { dataBreve, descriviPasso, durata, oraDi, riassuntoOutput } from '../lib'
import type { PassoRegistro } from '../tipi'

type Filtro = 'tutti' | 'brain' | 'persone'

/**
 * Il diario di bordo del progetto: ogni passo del Brain e ogni decisione di una persona.
 * Serve a verificare cosa ha fatto l'AI e chi ha deciso cosa (trasparenza). In chiaro, per tutti;
 * i dati grezzi restano nei «dettagli tecnici».
 */
export function Registro() {
  const { progetto, persone, sonoManager } = useApp()
  const { proposte, documenti } = useDati()
  const [passi, setPassi] = useState<PassoRegistro[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('tutti')
  const [documento, setDocumento] = useState('')

  useEffect(() => {
    if (!sonoManager) return
    api.registro(progetto.id).then(setPassi).catch((e) => setErrore(e.message))
  }, [progetto.id, sonoManager, proposte])

  if (!sonoManager) return <Card><Vuoto icona={UserCheck} titolo="Solo per il manager" testo="Il registro completo dei passi è visibile al manager del progetto." /></Card>

  const nome = (id: string) => persone[id]?.nome ?? id
  const titolo = (id: string) => documenti.find((d) => d.id === id)?.titolo ?? null
  const docDi = (p: PassoRegistro) => p.documento_id ?? (typeof p.input.documento_id === 'string' ? p.input.documento_id : '')
  const visibili = (passi ?? [])
    .filter((p) => filtro === 'tutti' || (filtro === 'brain') === (p.attore === 'brain'))
    .filter((p) => !documento || docDi(p) === documento)
    .sort((a, b) => b.quando.localeCompare(a.quando))
  const docsNelRegistro = [...new Set((passi ?? []).map(docDi).filter(Boolean))]

  return (
    <>
      <TitoloPagina titolo="Registro" sottotitolo="Il diario di bordo del progetto: cosa ha fatto il Brain e cosa hanno deciso le persone, in ordine." />

      <Card className="mb-6 flex max-w-4xl gap-3 p-4 text-sm leading-relaxed text-grafite">
        <ScrollText size={18} className="mt-0.5 shrink-0 text-inchiostro" />
        <p>
          Ogni volta che il Brain legge un documento, estrae informazioni o confronta riunioni, e ogni volta che qualcuno
          approva, rifiuta o fa una domanda, qui resta una riga. Così puoi sempre verificare <b className="text-inchiostro">da dove viene</b> una proposta,
          <b className="text-inchiostro"> quale modello</b> l'ha prodotta e <b className="text-inchiostro">chi l'ha approvata</b>. Nulla entra nella memoria senza lasciare traccia.
        </p>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-[5px] border border-inchiostro p-0.5">
          {([['tutti', 'Tutto'], ['brain', 'Solo il Brain'], ['persone', 'Solo le persone']] as const).map(([k, t]) => (
            <button key={k} onClick={() => setFiltro(k)}
              aria-pressed={filtro === k}
              className={clsx('rounded-[3px] px-3 py-1.5 text-sm font-semibold transition-colors', filtro === k ? 'bg-inchiostro text-foglio' : 'text-grafite hover:text-inchiostro')}>
              {t}
            </button>
          ))}
        </div>
        {docsNelRegistro.length > 0 && (
          <select value={documento} onChange={(e) => setDocumento(e.target.value)} aria-label="Filtra per documento" className="rounded-[4px] border border-linea-forte bg-foglio px-3 py-2 text-sm">
            <option value="">Tutti i documenti</option>
            {docsNelRegistro.map((d) => <option key={d} value={d}>{titolo(d) ?? d}</option>)}
          </select>
        )}
      </div>

      <Card>
        {errore ? <Vuoto icona={UserCheck} titolo="Registro non disponibile" testo={errore} /> : !passi ? <Scheletro /> : visibili.length === 0 ? (
          <Vuoto icona={ScrollText} titolo="Nessun passo da mostrare" testo="Carica una riunione: ogni passo del Brain comparirà qui." />
        ) : (
          <ol className="p-6">
            {visibili.map((p, i) => {
              const umano = p.attore !== 'brain'
              const problema = p.esito && p.esito !== 'ok'
              return (
                <li key={p.id ?? i} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < visibili.length - 1 && <span className="absolute top-10 bottom-0 left-[17px] w-px bg-linea-forte" />}
                  {umano ? <Avatar persona={persone[p.attore]} nome={p.attore} size={36} /> : (
                    <MarchioBrain size={36} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <p className="font-semibold">{descriviPasso(p, nome, titolo)}</p>
                      <span className="condensato text-sm text-grafite">{dataBreve(p.quando)}, {oraDi(p.quando)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {problema && <Badge tono={p.esito === 'errore' ? 'rosso' : 'giallo'} icona={CircleAlert}>{p.esito === 'errore' ? 'Errore' : 'Scartato'}</Badge>}
                      {riassuntoOutput(p.output).map((r) => <Badge key={r}>{r}</Badge>)}
                      {p.modello && <Badge tono="viola">{p.provider === 'locale' ? 'modello locale' : p.provider === 'cloud' ? 'modello cloud' : 'modello finto'}: {p.modello}</Badge>}
                      {durata(p.durata_ms) && <Badge tono="blu">{durata(p.durata_ms)}</Badge>}
                      {(p.tentativi ?? 1) > 1 && <Badge tono="giallo">{p.tentativi} tentativi</Badge>}
                    </div>
                    {p.motivo && <p className={clsx('mt-1.5 text-sm', problema ? 'text-segnale-scuro' : 'text-grafite')}>{p.motivo}</p>}
                    <details className="group mt-2">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-grafite hover:text-inchiostro">
                        <ChevronRight size={12} className="transition group-open:rotate-90" /> Dettagli tecnici
                      </summary>
                      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                        <pre className="overflow-x-auto rounded-[4px] border border-linea bg-velina p-2.5 text-grafite"><span className="font-sans font-semibold text-inchiostro">Input </span>{JSON.stringify(p.input, null, 1)}</pre>
                        <pre className="overflow-x-auto rounded-[4px] border border-linea bg-velina p-2.5 text-grafite"><span className="font-sans font-semibold text-inchiostro">Output </span>{JSON.stringify(p.output, null, 1)}</pre>
                      </div>
                      {p.versione_prompt && <p className="mt-1 text-xs text-traccia">Versione del prompt: {p.versione_prompt}</p>}
                    </details>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </Card>
    </>
  )
}
