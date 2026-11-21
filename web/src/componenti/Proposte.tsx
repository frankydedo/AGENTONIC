import clsx from 'clsx'
import {
  BookMarked, Check, CircleCheck, FileText, ListPlus, PenLine, RefreshCw, RotateCcw, TriangleAlert, type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { campo, daChiarire, dataBreve, oraDi, titoloProposta } from '../lib'
import type { Area, Modifiche, Proposta } from '../tipi'
import { Cassetto, SelettoreAree } from './Selettori'
import { Avatar, Badge, Bottone, ChipArea, Citazioni, Esito, Scadenza } from './ui'

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
  const { decidi, riapri, avvisoDiProposta, documenti } = useDati()
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
      layout="position"
      onMouseEnter={() => onEvidenzia?.(segmenti)} onMouseLeave={() => onEvidenzia?.(null)}
      className={clsx('list-none py-4 transition-colors', correggiSubito ? 'px-0' : 'px-5', !inAttesa && !correggiSubito && 'bg-riempimento/40')}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-testo-2">
        {inAttesa ? (
          <>
            <span className="inline-flex items-center gap-1.5 font-semibold text-testo"><Icona size={14} strokeWidth={2.2} className="text-accento-testo" />{etichetta}</span>
            {dubbio && <span className="inline-flex items-center gap-1.5 font-semibold text-arancio-testo"><span className="h-1.5 w-1.5 rounded-full bg-arancio" />Da chiarire</span>}
          </>
        ) : (
          <span className="inline-flex items-center gap-2">
            <Esito esito={p.stato === 'approvata' ? 'approvata' : 'rifiutata'} nuovo={appenaDecisa} />
            <span className={clsx('font-semibold', p.stato === 'approvata' ? 'text-verde-testo' : 'text-testo-2')}>{p.stato === 'approvata' ? 'Approvata' : 'Rifiutata'}</span>
            <span>{etichetta}</span>
          </span>
        )}
        {mostraDocumento && documento && (
          <Link to={`/documenti/${documento.id}`} className="ml-auto inline-flex items-center gap-1 hover:text-accento-testo">
            <FileText size={12} /> {documento.titolo}
          </Link>
        )}
      </div>

      {inModifica && inAttesa ? (
        <div className="mt-3 space-y-3">
          {isFatto ? (
            <Campo etichetta={`${campo(p, 'soggetto')}, ${campo(p, 'attributo')}`}>
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
                    className={clsx(INPUT, !bozza.assegnatario_id && 'ring-2 ring-arancio/60')}>
                    <option value="">Nessuno</option>
                    {membri.map((m) => <option key={m.id} value={m.id}>{m.nome}, {m.ruolo}</option>)}
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
          <p className={clsx('mt-1.5 text-[17px] leading-snug font-semibold tracking-[-0.01em]', p.stato === 'rifiutata' && 'text-testo-2 line-through decoration-testo-3')}>{titoloProposta(p)}</p>
          {!isFatto && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-testo-2">
              {assegnatario
                ? <span className="inline-flex items-center gap-1.5 text-testo"><Avatar persona={assegnatario} size={20} />{assegnatario.nome}</span>
                : <Badge tono="giallo">Nessun responsabile</Badge>}
              <span>{campo(p, 'scadenza') ? `entro ${dataBreve(campo(p, 'scadenza'))}` : 'senza scadenza'}</span>
              {inAttesa && campo(p, 'scadenza') && <Scadenza iso={campo(p, 'scadenza')} />}
            </div>
          )}
        </>
      )}

      {inAttesa && dubbio && (
        <div className="mt-3 flex gap-2.5 rounded-2xl bg-arancio-tenue px-3.5 py-2.5 text-sm leading-snug">
          <TriangleAlert size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-arancio-testo" />
          <span>{avviso?.testo ?? 'Il Brain non è sicuro di questa voce: controllala prima di approvarla.'}</span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5">
          <span className="text-xs text-testo-2" title="Chi ha almeno una di queste aree potrà vedere la voce">Visibile a</span>
          {inAttesa
            ? <SelettoreAree valore={aree} onCambia={setAree} />
            : (p.aree_confermate ?? p.aree_proposte).map((a) => <ChipArea key={a} area={a} />)}
        </span>
        <Citazioni citazioni={p.citazioni} />
      </div>

      {inAttesa ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {inModifica ? (
            <>
              <Bottone variante="primario" icona={Check} disabled={occupato || !aree.length} onClick={() => esegui('approva')}>
                Approva con le correzioni
              </Bottone>
              <Bottone variante="secondario" onClick={() => { setBozza(originale); setInModifica(false) }}>Annulla</Bottone>
            </>
          ) : (
            <>
              {dubbio
                ? <Bottone variante="primario" icona={PenLine} onClick={() => setInModifica(true)}>Correggi</Bottone>
                : <Bottone variante="primario" icona={Check} disabled={occupato || !aree.length} onClick={() => esegui('approva')}>Approva</Bottone>}
              {dubbio
                ? <Bottone variante="secondario" disabled={occupato || !aree.length} onClick={() => esegui('approva')}>Approva così</Bottone>
                : <Bottone variante="secondario" onClick={() => setInModifica(true)}>Correggi</Bottone>}
              <Bottone variante="pericolo" disabled={occupato} onClick={() => esegui('rifiuta')}>Rifiuta</Bottone>
            </>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {p.decisa_da && (
            <p className="text-[13px] text-testo-2">
              {p.stato === 'approvata' ? 'Approvata' : 'Rifiutata'} da {persone[p.decisa_da]?.nome ?? p.decisa_da}
              {p.decisa_il && ` alle ${oraDi(p.decisa_il)}`}
            </p>
          )}
          {p.stato === 'rifiutata' && (
            <Bottone piccolo variante="secondario" icona={RotateCcw} disabled={occupato}
              onClick={async () => { setOccupato(true); try { await riapri(p) } catch { /* toast già mostrato */ } finally { setOccupato(false) } }}>
              Recupera
            </Bottone>
          )}
        </div>
      )}
    </motion.li>
  )
}

const INPUT = 'w-full rounded-xl bg-riempimento px-3.5 py-2.5 text-[15px] text-testo transition focus:bg-superficie focus:ring-3 focus:ring-accento/35 focus:outline-none'

function Campo({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-testo-2">{etichetta}</span>
      {children}
    </label>
  )
}

/**
 * Le proposte divise in cassetti apribili: da decidere (aperto), approvate e rifiutate (chiusi).
 * Le rifiutate si possono recuperare.
 */
export function ProposteACassetti({ proposte, mostraDocumento, onEvidenzia }: {
  proposte: Proposta[]; mostraDocumento?: boolean; onEvidenzia?: (segmenti: string[] | null) => void
}) {
  const daDecidere = proposte.filter((p) => p.stato === 'in_attesa').sort((a, b) => Number(daChiarire(b)) - Number(daChiarire(a)))
  const approvate = proposte.filter((p) => p.stato === 'approvata')
  const rifiutate = proposte.filter((p) => p.stato === 'rifiutata')
  const elenco = (xs: Proposta[], vuoto: string) => xs.length === 0
    ? <p className="px-5 pb-4 text-sm text-testo-2">{vuoto}</p>
    : <ul className="divide-y divide-separatore">{xs.map((p) => <CartaProposta key={p.id} p={p} mostraDocumento={mostraDocumento} onEvidenzia={onEvidenzia} />)}</ul>
  return (
    <div>
      <Cassetto titolo="Da decidere" conteggio={daDecidere.length} apertoIniziale tono="accento">
        {elenco(daDecidere, 'Niente da decidere: la memoria è aggiornata.')}
      </Cassetto>
      <Cassetto titolo="Approvate" conteggio={approvate.length} tono="verde">
        {elenco(approvate, 'Ancora nessuna proposta approvata.')}
      </Cassetto>
      <Cassetto titolo="Rifiutate" conteggio={rifiutate.length} tono="neutro">
        {elenco(rifiutate, 'Nessuna proposta rifiutata.')}
      </Cassetto>
    </div>
  )
}
