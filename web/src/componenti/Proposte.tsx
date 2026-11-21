import clsx from 'clsx'
import {
  BookMarked, Check, CircleCheck, FileText, ListPlus, PenLine, RefreshCw, TriangleAlert, X, type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { campo, daChiarire, dataBreve, oraDi, titoloProposta } from '../lib'
import { AREE, type Area, type Modifiche, type Proposta } from '../tipi'
import { Avatar, Badge, Bottone, ChipArea, Citazioni, Scadenza, Timbro } from './ui'

const TIPI: Record<Proposta['tipo'], [string, LucideIcon]> = {
  nuovo_task: ['Nuovo task', ListPlus],
  aggiorna_task: ['Aggiorna task', RefreshCw],
  chiudi_task: ['Chiudi task', CircleCheck],
  nuovo_fatto: ['Nuovo fatto in memoria', BookMarked],
}

/**
 * Una proposta del Brain. Il manager la approva, la rifiuta o la CORREGGE prima di approvarla
 * (assegnatario, scadenza, titolo, aree): così si risolvono i punti oscuri.
 */
export function CartaProposta({ p, correggiSubito = false, mostraDocumento = false, onDecisa, onEvidenzia }: {
  p: Proposta
  correggiSubito?: boolean
  mostraDocumento?: boolean
  onDecisa?: () => void
  onEvidenzia?: (segmenti: string[] | null) => void
}) {
  const { membri, persone } = useApp()
  const { decidi, avvisoDiProposta, documenti } = useDati()
  const [inModifica, setInModifica] = useState(correggiSubito)
  const [occupato, setOccupato] = useState(false)
  const [appenaDecisa, setAppenaDecisa] = useState(false)
  const originale = {
    titolo: campo(p, 'titolo') ?? '',
    assegnatario_id: campo(p, 'assegnatario_id') ?? '',
    scadenza: campo(p, 'scadenza') ?? '',
    valore: campo(p, 'valore') ?? '',
  }
  const [bozza, setBozza] = useState(originale)
  const [aree, setAree] = useState<Area[]>(p.aree_confermate ?? p.aree_proposte)

  const [etichetta, Icona] = TIPI[p.tipo]
  const isFatto = p.tipo === 'nuovo_fatto'
  const inAttesa = p.stato === 'in_attesa'
  const dubbio = daChiarire(p)
  const avviso = avvisoDiProposta(p)
  const assegnatario = persone[campo(p, 'assegnatario_id') ?? '']
  const documento = documenti.find((d) => d.id === p.documento_id)

  const alterna = (a: Area) => setAree((xs) => (xs.includes(a) ? xs.filter((x) => x !== a) : [...xs, a]))

  const modifiche = (): Modifiche | undefined => {
    const m: Modifiche = {}
    if (isFatto) {
      if (bozza.valore !== originale.valore) m.valore = bozza.valore
    } else {
      if (bozza.titolo !== originale.titolo) m.titolo = bozza.titolo
      if (bozza.assegnatario_id !== originale.assegnatario_id) m.assegnatario_id = bozza.assegnatario_id || null
      if (bozza.scadenza !== originale.scadenza) m.scadenza = bozza.scadenza || null
    }
    return Object.keys(m).length ? m : undefined
  }

  const esegui = async (esito: 'approva' | 'rifiuta') => {
    setOccupato(true)
    try {
      await decidi(p, esito, esito === 'approva' ? { aree, modifiche: inModifica ? modifiche() : undefined } : {})
      setInModifica(false)
      setAppenaDecisa(true)
      onDecisa?.()
    } catch { /* il toast l'ha già mostrato */ } finally {
      setOccupato(false)
    }
  }

  const segmenti = p.citazioni.map((c) => c.segmento_id)
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      onMouseEnter={() => onEvidenzia?.(segmenti)} onMouseLeave={() => onEvidenzia?.(null)}
      className={clsx(
        'relative list-none rounded-[5px] border p-4 transition-colors',
        !inAttesa && 'border-linea bg-velina/70',
        inAttesa && dubbio && 'border-segnale bg-foglio shadow-[inset_4px_0_0_var(--color-segnale)] pl-5',
        inAttesa && !dubbio && 'border-linea-forte/70 bg-foglio hover:border-inchiostro/60',
      )}
    >
      {!inAttesa && <Timbro esito={p.stato === 'approvata' ? 'approvata' : 'rifiutata'} nuovo={appenaDecisa} className="absolute top-3 right-4" />}
      <div className="flex flex-wrap items-center gap-2 pr-28 text-xs text-grafite">
        <span className="inline-flex items-center gap-1.5 font-semibold text-inchiostro"><Icona size={14} strokeWidth={2.3} />{etichetta}</span>
        {mostraDocumento && documento && (
          <Link to={`/documenti/${documento.id}`} className="ml-auto inline-flex items-center gap-1 underline-offset-4 hover:text-inchiostro hover:underline">
            <FileText size={12} /> {documento.titolo}
          </Link>
        )}
      </div>

      {inModifica && inAttesa ? (
        <div className="mt-3 space-y-3">
          {isFatto ? (
            <Campo etichetta={`${campo(p, 'soggetto')} · ${campo(p, 'attributo')}`}>
              <input value={bozza.valore} onChange={(e) => setBozza({ ...bozza, valore: e.target.value })} className={INPUT} />
            </Campo>
          ) : (
            <>
              <Campo etichetta="Titolo">
                <input value={bozza.titolo} onChange={(e) => setBozza({ ...bozza, titolo: e.target.value })} className={INPUT} />
              </Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etichetta="Chi se ne occupa">
                  <select value={bozza.assegnatario_id} onChange={(e) => setBozza({ ...bozza, assegnatario_id: e.target.value })}
                    className={clsx(INPUT, !bozza.assegnatario_id && 'border-segnale bg-segnale-chiaro')}>
                    <option value="">— nessuno —</option>
                    {membri.map((m) => <option key={m.id} value={m.id}>{m.nome} · {m.ruolo}</option>)}
                  </select>
                </Campo>
                <Campo etichetta="Scadenza">
                  <input type="date" value={bozza.scadenza} onChange={(e) => setBozza({ ...bozza, scadenza: e.target.value })} className={INPUT} />
                </Campo>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <p className={clsx('mt-2 text-[16px] leading-snug font-semibold', p.stato === 'rifiutata' && 'text-grafite line-through decoration-allarme/50')}>{titoloProposta(p)}</p>
          {!isFatto && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-grafite">
              {assegnatario
                ? <span className="inline-flex items-center gap-1.5"><Avatar persona={assegnatario} size={22} />{assegnatario.nome}</span>
                : <Badge tono="giallo">Nessun responsabile</Badge>}
              <span>{campo(p, 'scadenza') ? `entro ${dataBreve(campo(p, 'scadenza'))}` : 'senza scadenza'}</span>
              {inAttesa && campo(p, 'scadenza') && <Scadenza iso={campo(p, 'scadenza')} />}
            </div>
          )}
        </>
      )}

      {inAttesa && dubbio && (
        <div className="mt-3 flex gap-2 rounded-[3px] bg-segnale-chiaro px-3 py-2 text-sm text-segnale-scuro">
          <TriangleAlert size={16} strokeWidth={2.3} className="mt-0.5 shrink-0" />
          <span>{avviso?.testo ?? 'Il Brain non è sicuro di questa voce: controllala prima di approvarla.'}</span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-grafite" title="Chi ha almeno una di queste aree potrà vedere la voce">Visibile a:</span>
        {inAttesa
          ? AREE.map((a) => <ChipArea key={a} area={a} attiva={aree.includes(a)} onClick={() => alterna(a)} />)
          : (p.aree_confermate ?? p.aree_proposte).map((a) => <ChipArea key={a} area={a} />)}
      </div>

      <Citazioni citazioni={p.citazioni} className="mt-3" />

      {inAttesa ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {inModifica ? (
            <>
              <Bottone variante="successo" icona={Check} disabled={occupato || !aree.length} onClick={() => esegui('approva')}>
                Approva con le correzioni
              </Bottone>
              <Bottone variante="fantasma" onClick={() => { setBozza(originale); setInModifica(false) }}>Annulla</Bottone>
            </>
          ) : (
            <>
              {dubbio
                ? <Bottone variante="attenzione" icona={PenLine} onClick={() => setInModifica(true)}>Correggi</Bottone>
                : <Bottone variante="successo" icona={Check} disabled={occupato || !aree.length} onClick={() => esegui('approva')}>Approva</Bottone>}
              {dubbio
                ? <Bottone icona={Check} disabled={occupato || !aree.length} onClick={() => esegui('approva')}>Approva così</Bottone>
                : <Bottone icona={PenLine} onClick={() => setInModifica(true)}>Correggi</Bottone>}
              <Bottone variante="pericolo" icona={X} disabled={occupato} onClick={() => esegui('rifiuta')}>Rifiuta</Bottone>
            </>
          )}
        </div>
      ) : (
        p.decisa_da && (
          <p className="mt-3 text-xs text-grafite">
            {p.stato === 'approvata' ? 'Approvata' : 'Rifiutata'} da {persone[p.decisa_da]?.nome ?? p.decisa_da}
            {p.decisa_il && ` alle ${oraDi(p.decisa_il)}`}
          </p>
        )
      )}
    </motion.li>
  )
}

const INPUT = 'w-full rounded-[4px] border border-linea-forte bg-foglio px-3 py-2 text-sm transition focus:border-inchiostro focus:ring-2 focus:ring-segnale/50 focus:outline-none'

function Campo({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-grafite">{etichetta}</span>
      {children}
    </label>
  )
}
