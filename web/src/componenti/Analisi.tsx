import clsx from 'clsx'
import {
  ArrowRight, Check, CircleAlert, RotateCcw, UploadCloud,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { descriviPasso, durata, riassuntoOutput } from '../lib'
import type { EsitoCaricamento, PassoRegistro } from '../tipi'
import { Badge, Bottone, MarchioBrain } from './ui'

/** I passi fissi del workflow (solution.md §4): si mostrano mentre il Brain lavora. */
const PREVISTI = [
  ['Lettura', 'Divide la riunione in interventi; se è lunga, in parti «x/X»'],
  ['Estrazione', 'Task, assegnatari, scadenze, decisioni e fatti'],
  ['Chi è chi', 'Abbina i nomi detti alle persone del progetto; se non è sicuro, lo segnala'],
  ['Lacune', 'Persone e contesti che non conosce'],
  ['Incongruenze', 'Confronto con le riunioni precedenti'],
  ['Proposte', 'Cosa cambia nella lista del progetto: decidi tu'],
] as const

type Stato =
  | { fase: 'scelta' }
  | { fase: 'in_corso'; file: string; dal: number }
  | { fase: 'fatto'; file: string; esito: EsitoCaricamento; passi: PassoRegistro[] }
  | { fase: 'errore'; file: string; messaggio: string }

/**
 * Carica la minuta di una riunione e fa vedere il Brain che lavora: i passi previsti mentre
 * aspetta, poi la traccia vera dal registro (cosa ha letto, cosa ha prodotto, con quale modello).
 */
export function PannelloAnalisi({ onChiudi }: { onChiudi?: () => void }) {
  const { progetto, persone } = useApp()
  const { ricarica, passiLive, documenti } = useDati()
  const vai = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [stato, setStato] = useState<Stato>({ fase: 'scelta' })
  const [sopra, setSopra] = useState(false)

  const carica = async (f: File) => {
    const dal = Date.now()
    setStato({ fase: 'in_corso', file: f.name, dal })
    try {
      const [esito] = await Promise.all([
        api.caricaRiunione(progetto.id, f),
        new Promise((r) => setTimeout(r, 600)), // evita lo sfarfallio se il backend risponde subito
      ])
      const registro = await api.registro(progetto.id).catch(() => [] as PassoRegistro[])
      const delDocumento = (p: PassoRegistro) => (p.documento_id ?? p.input.documento_id) === esito.documento_id
      const passi = registro.filter((p) => p.attore === 'brain' && delDocumento(p))
      setStato({ fase: 'fatto', file: f.name, esito, passi })
      ricarica()
    } catch (e) {
      setStato({ fase: 'errore', file: f.name, messaggio: (e as Error).message })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  const nome = (id: string) => persone[id]?.nome ?? id
  const titolo = (id: string) => documenti.find((d) => d.id === id)?.titolo ?? null

  if (stato.fase === 'scelta') {
    return (
      <label
        onDragOver={(e) => { e.preventDefault(); setSopra(true) }}
        onDragLeave={() => setSopra(false)}
        onDrop={(e) => { e.preventDefault(); setSopra(false); const f = e.dataTransfer.files[0]; if (f) carica(f) }}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-10 text-center transition-colors',
          sopra ? 'border-inchiostro bg-segnale-chiaro' : 'border-linea-forte bg-foglio/60 hover:border-inchiostro hover:bg-foglio',
        )}
      >
        <input ref={input} type="file" accept=".md,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && carica(e.target.files[0])} />
        <UploadCloud size={28} strokeWidth={1.8} className="text-inchiostro" />
        <p className="mt-3 font-semibold">Trascina qui la minuta di una riunione</p>
        <p className="mt-1 text-sm text-grafite">oppure <span className="font-semibold text-inchiostro underline underline-offset-4">sfoglia i file</span>. Formati .md o .txt, per il progetto {progetto.nome}.</p>
      </label>
    )
  }

  const liveDopo = stato.fase === 'in_corso' ? passiLive.filter((p) => Date.parse(p.quando) >= stato.dal - 2000) : []

  return (
    <div>
      <div className="flex items-center gap-3">
        {stato.fase === 'errore'
          ? <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[5px] bg-allarme text-foglio"><CircleAlert size={20} /></span>
          : <MarchioBrain size={40} parla={stato.fase === 'in_corso'} />}
        <div className="min-w-0">
          <p className="font-bold [font-stretch:108%]">
            {stato.fase === 'in_corso' ? 'Il Brain sta leggendo la riunione…' : stato.fase === 'errore' ? 'Il Brain non ha potuto leggere il file' : 'Analisi completata'}
          </p>
          <p className="condensato truncate text-sm text-grafite">{stato.file}</p>
        </div>
      </div>

      {stato.fase === 'errore' && (
        <div className="mt-4 rounded-[4px] border border-allarme/30 bg-allarme-chiaro p-4 text-sm text-allarme">
          <p className="font-semibold">{stato.messaggio}</p>
          <p className="mt-1">Nessuna proposta è stata creata: il documento è stato rifiutato prima di arrivare al modello.</p>
        </div>
      )}

      {stato.fase === 'in_corso' && (
        <ol className="mt-5 divide-y divide-linea border-y border-linea">
          {PREVISTI.map(([t, d], i) => {
            const fatto = liveDopo[i]
            return (
              <li key={t} className="flex gap-3 py-2.5">
                <span className={clsx('condensato grid h-6 w-6 shrink-0 place-items-center rounded-[3px] text-xs font-bold',
                  fatto ? 'bg-timbro text-foglio' : i === liveDopo.length ? 'animate-spia bg-segnale text-inchiostro' : 'border border-linea-forte text-traccia')}>
                  {fatto ? <Check size={13} strokeWidth={3} /> : i + 1}
                </span>
                <div>
                  <p className={clsx('text-sm font-semibold', !fatto && 'text-grafite')}>{t}</p>
                  <p className="text-xs text-grafite">{fatto ? riassuntoOutput(fatto.output).join(', ') || d : d}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {stato.fase === 'fatto' && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-[1.5px] overflow-hidden rounded-[4px] border-[1.5px] border-inchiostro bg-inchiostro">
            <div className="bg-foglio p-3"><p className="condensato text-[2.4rem] leading-none font-bold">{stato.esito.proposte}</p><p className="mt-1.5 text-xs text-grafite">proposte da decidere</p></div>
            <div className="bg-foglio p-3"><p className="condensato text-[2.4rem] leading-none font-bold">{stato.esito.avvisi}</p><p className="mt-1.5 text-xs text-grafite">avvisi (punti oscuri, incongruenze…)</p></div>
          </div>
          <p className="mt-5 mb-2 text-sm font-bold">Cosa ha fatto, passo per passo</p>
          {stato.passi.length === 0 ? (
            <p className="text-sm text-grafite">Il backend non ha ancora registrato i passi di questo documento.</p>
          ) : (
            <ol className="space-y-2">
              <AnimatePresence>
                {stato.passi.map((p, i) => (
                  <motion.li key={`${p.step}-${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }}
                    className="flex gap-3 rounded-[4px] border border-linea bg-foglio p-3">
                    {p.esito === 'errore' ? <CircleAlert size={18} className="mt-0.5 shrink-0 text-allarme" />
                      : p.esito === 'scartato' ? <CircleAlert size={18} className="mt-0.5 shrink-0 text-segnale-scuro" />
                        : <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[3px] bg-timbro text-foglio"><Check size={12} strokeWidth={3} /></span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{descriviPasso(p, nome, titolo)}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {riassuntoOutput(p.output).map((r) => <Badge key={r}>{r}</Badge>)}
                        {p.modello && <Badge tono="viola">{p.provider === 'locale' ? 'modello locale' : p.provider === 'cloud' ? 'modello cloud' : 'modello finto'}: {p.modello}</Badge>}
                        {durata(p.durata_ms) && <Badge tono="blu">{durata(p.durata_ms)}</Badge>}
                      </div>
                      {p.motivo && <p className="mt-1 text-xs text-grafite">{p.motivo}</p>}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}
        </>
      )}

      {stato.fase !== 'in_corso' && (
        <div className="mt-5 flex flex-wrap gap-2">
          {stato.fase === 'fatto' && (
            <Bottone variante="primario" icona={ArrowRight} onClick={() => { onChiudi?.(); vai(`/documenti/${stato.esito.documento_id}`) }}>
              Rivedi le proposte
            </Bottone>
          )}
          <Bottone icona={RotateCcw} onClick={() => setStato({ fase: 'scelta' })}>Carica un altro file</Bottone>
        </div>
      )}
    </div>
  )
}
