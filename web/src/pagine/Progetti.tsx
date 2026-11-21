import clsx from 'clsx'
import { format } from 'date-fns'
import { ArrowRight, CalendarClock, Check, CircleAlert, Crown, Eye, FolderPlus, Pencil } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import { SelettorePersone } from '../componenti/Selettori'
import { Avatar, Badge, Bottone, Card, ChipArea, Modale, TitoloPagina } from '../componenti/ui'
import { useApp } from '../contesto'
import { giorniA, oggi, puoCreareProgetti, puoModificare, scadenzaRelativa, validaProgetto } from '../lib'
import type { DatiProgetto, Persona, Progetto } from '../tipi'

/**
 * Tutti i progetti di cui la persona è membro (lo decide il backend). Chi ne ha più di uno li
 * naviga da qui; chi ha ruolo «project manager» ne crea di nuovi; il manager di un progetto lo modifica.
 */
export function Progetti() {
  const { io, progetti, persone, ricaricaProgetti, scegliProgetto } = useApp()
  const [modulo, setModulo] = useState<{ aperto: boolean; progetto: Progetto | null }>({ aperto: false, progetto: null })
  const creatore = puoCreareProgetti(io)
  const ordinati = [...progetti].sort((a, b) => Number(b.manager_id === io.id) - Number(a.manager_id === io.id) || a.scadenza.localeCompare(b.scadenza))

  return (
    <>
      <TitoloPagina
        titolo="Progetti"
        sottotitolo={creatore
          ? 'I progetti a cui partecipi. Puoi crearne di nuovi e decidere chi ci lavora e chi li guida.'
          : 'Vedi solo i progetti a cui sei assegnato. Dentro ognuno vedi solo ciò che rientra nelle tue competenze.'}
        azioni={creatore && <Bottone variante="primario" icona={FolderPlus} onClick={() => setModulo({ aperto: true, progetto: null })}>Nuovo progetto</Bottone>}
      />
      <ul className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {ordinati.map((p, i) => (
          <motion.li key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <SchedaProgetto p={p} onModifica={() => setModulo({ aperto: true, progetto: p })} />
          </motion.li>
        ))}
      </ul>
      <Modale aperto={modulo.aperto} onChiudi={() => setModulo({ aperto: false, progetto: null })}
        titolo={modulo.progetto ? `Modifica «${modulo.progetto.nome}»` : 'Nuovo progetto'}>
        <ModuloProgetto key={modulo.progetto?.id ?? 'nuovo'} progetto={modulo.progetto} onFatto={() => setModulo({ aperto: false, progetto: null })}
          io={io} tutte={Object.values(persone)} ricaricaProgetti={ricaricaProgetti} scegliProgetto={scegliProgetto} />
      </Modale>
    </>
  )
}

function SchedaProgetto({ p, onModifica }: { p: Progetto; onModifica: () => void }) {
  const { io, persone, progetto, scegliProgetto } = useApp()
  const sonoManager = p.manager_id === io.id
  const attuale = p.id === progetto.id
  const manager = persone[p.manager_id]
  const scad = scadenzaRelativa(p.scadenza)
  const [conti, setConti] = useState<{ miei: number; daDecidere: number | null } | null>(null)

  // I numeri arrivano dal backend, già filtrati per i permessi di chi guarda.
  useEffect(() => {
    let vivo = true
    Promise.all([
      api.todoProgetto(p.id).catch(() => []),
      sonoManager ? api.proposte(p.id, 'in_attesa').catch(() => null) : Promise.resolve(null),
    ]).then(([task, proposte]) => {
      if (!vivo) return
      setConti({
        miei: task.filter((t) => t.assegnatario_id === io.id && t.stato !== 'fatto' && t.stato !== 'annullato').length,
        daDecidere: proposte ? proposte.length : null,
      })
    })
    return () => { vivo = false }
  }, [p.id, io.id, sonoManager])

  return (
    <Card className={clsx('flex h-full flex-col', attuale && 'ring-2 ring-accento')}>
      <div className="flex-1 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {sonoManager ? <Badge tono="viola" icona={Crown}>Sei il manager</Badge> : <Badge>Membro</Badge>}
          {attuale && <Badge tono="giallo" icona={Check}>Aperto ora</Badge>}
          <Badge tono={scad.tono} icona={CalendarClock}>{giorniA(p.scadenza) >= 0 ? `scade ${scad.testo}` : scad.testo}</Badge>
        </div>
        <h2 className="mt-3 text-[19px] leading-snug font-bold tracking-[-0.015em]">{p.nome}</h2>
        <p className="text-sm text-testo-2">{p.cliente}</p>
        {p.descrizione && <p className="mt-2 line-clamp-2 text-sm text-testo-2">{p.descrizione}</p>}

        <div className="mt-4 flex items-center gap-2 text-sm">
          <Avatar persona={manager} size={24} />
          <span><span className="text-testo-2">Manager:</span> {manager?.nome ?? p.manager_id}</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="flex -space-x-1.5">{p.membri.slice(0, 8).map((id) => <Avatar key={id} persona={persone[id]} nome={id} size={24} />)}</span>
          <span className="text-xs text-testo-2">{p.membri.length} persone</span>
        </div>

        {!sonoManager && (
          <p className="mt-4 flex flex-wrap items-center gap-1 text-xs text-testo-2">
            <Eye size={13} /> Qui vedi: {io.competenze.map((a) => <ChipArea key={a} area={a} />)}
          </p>
        )}
      </div>

      <div className="mx-5 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-riempimento/70 px-3.5 py-3">
          <p className="cifre text-[24px] leading-none font-bold">{conti ? conti.miei : '·'}</p>
          <p className="mt-1 text-xs text-testo-2">task tuoi aperti</p>
        </div>
        <div className="rounded-2xl bg-riempimento/70 px-3.5 py-3">
          {sonoManager
            ? <><p className={clsx('cifre text-[24px] leading-none font-bold', conti?.daDecidere && 'text-arancio-testo')}>{conti?.daDecidere ?? '·'}</p><p className="mt-1 text-xs text-testo-2">proposte da decidere</p></>
            : <><p className="text-[24px] leading-none font-bold text-testo-3">—</p><p className="mt-1 text-xs text-testo-2">le decide il manager</p></>}
        </div>
      </div>

      <div className="flex gap-2 p-5 pt-4">
        <Bottone variante={attuale ? 'secondario' : 'primario'} icona={ArrowRight} className="flex-1" onClick={() => scegliProgetto(p.id)}>
          {attuale ? 'Vai alla panoramica' : 'Apri il progetto'}
        </Bottone>
        {puoModificare(io, p) && <Bottone icona={Pencil} onClick={onModifica} aria-label={`Modifica ${p.nome}`}>Modifica</Bottone>}
      </div>
    </Card>
  )
}

const INPUT = 'w-full rounded-xl bg-riempimento px-3.5 py-2.5 text-[15px] text-testo transition placeholder:text-testo-3 focus:bg-superficie focus:ring-3 focus:ring-accento/35 focus:outline-none'

/** Crea (progetto = null) o modifica un progetto. Nessun dato finto: se il backend non può, lo dice. */
export function ModuloProgetto({ progetto, onFatto, io, tutte, ricaricaProgetti, scegliProgetto }: {
  progetto: Progetto | null; onFatto: () => void
  io: Persona; tutte: Persona[]; ricaricaProgetti: () => Promise<Progetto[]>; scegliProgetto: (id: string) => void
}) {
  const [conferma, setConferma] = useState(false)
  const [d, setD] = useState<DatiProgetto>(progetto
    ? { nome: progetto.nome, cliente: progetto.cliente, manager_id: progetto.manager_id, membri: progetto.membri, scadenza: progetto.scadenza, descrizione: progetto.descrizione }
    : { nome: '', cliente: '', manager_id: io.id, membri: [io.id], scadenza: '', descrizione: '' })
  const [tentato, setTentato] = useState(false)
  const [erroreBackend, setErroreBackend] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
  const errori = validaProgetto(d, format(oggi(), 'yyyy-MM-dd'))

  const scegliManager = (id: string) => setD((x) => ({ ...x, manager_id: id, membri: x.membri.includes(id) ? x.membri : [...x.membri, id] }))

  const salva = async () => {
    setTentato(true)
    setErroreBackend(null)
    if (errori.length) return
    setOccupato(true)
    try {
      const salvato = progetto ? await api.modificaProgetto(progetto.id, d) : await api.creaProgetto(d)
      await ricaricaProgetti()
      toast.success(progetto ? 'Progetto aggiornato' : 'Progetto creato', { description: salvato.nome })
      onFatto()
      if (!progetto) scegliProgetto(salvato.id)
    } catch (e) {
      setErroreBackend((e as Error).message)
    } finally {
      setOccupato(false)
    }
  }

  const elimina = async () => {
    if (!progetto) return
    setOccupato(true)
    try {
      await api.eliminaProgetto(progetto.id)
      toast.success('Progetto eliminato', { description: progetto.nome })
      onFatto()
      await ricaricaProgetti()
    } catch (e) {
      setErroreBackend((e as Error).message)
    } finally {
      setOccupato(false)
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); salva() }} className="space-y-4">
      <Campo etichetta="Nome del progetto">
        <input value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} className={INPUT} placeholder="Es. Revamping linea 4" />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etichetta="Cliente">
          <input value={d.cliente} onChange={(e) => setD({ ...d, cliente: e.target.value })} className={INPUT} placeholder="Es. Pastificio Valsangone S.p.A." />
        </Campo>
        <Campo etichetta="Scadenza">
          <input type="date" value={d.scadenza} onChange={(e) => setD({ ...d, scadenza: e.target.value })} className={INPUT} />
        </Campo>
      </div>
      <Campo etichetta="Descrizione">
        <textarea value={d.descrizione} onChange={(e) => setD({ ...d, descrizione: e.target.value })} rows={2} className={INPUT} />
      </Campo>
      <Campo etichetta="Manager (approva le proposte del Brain e vede tutto il progetto)">
        <select value={d.manager_id} onChange={(e) => scegliManager(e.target.value)} className={INPUT}>
          {tutte.map((p) => <option key={p.id} value={p.id}>{p.nome}, {p.ruolo}</option>)}
        </select>
      </Campo>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-testo-2">Chi ci lavora ({d.membri.length})</legend>
        <SelettorePersone inline etichetta="Membri del progetto" persone={tutte} valore={d.membri} bloccate={[d.manager_id]}
          onCambia={(ids) => setD((x) => ({ ...x, membri: ids.includes(x.manager_id) ? ids : [...ids, x.manager_id] }))} />
        <p className="mt-1.5 text-xs text-testo-2">Ogni membro vedrà del progetto solo ciò che rientra nelle sue competenze.</p>
      </fieldset>

      {tentato && errori.length > 0 && (
        <ul className="rounded-2xl bg-arancio-tenue px-3.5 py-2.5 text-sm text-arancio-testo">{errori.map((e) => <li key={e}>• {e}</li>)}</ul>
      )}
      {erroreBackend && (
        <p className="flex gap-2 rounded-2xl bg-rosso-tenue px-3.5 py-2.5 text-sm text-rosso-testo"><CircleAlert size={16} className="mt-0.5 shrink-0" />{erroreBackend}</p>
      )}

      <div className="flex gap-2">
        <Bottone type="submit" variante="primario" icona={Check} disabled={occupato}>{progetto ? 'Salva le modifiche' : 'Crea il progetto'}</Bottone>
        <Bottone type="button" variante="secondario" onClick={onFatto}>Annulla</Bottone>
        {progetto && (conferma
          ? <Bottone type="button" variante="pericolo" className="ml-auto" disabled={occupato} onClick={elimina}>Elimina davvero, con tutti i dati</Bottone>
          : <Bottone type="button" variante="fantasma" className="ml-auto" onClick={() => setConferma(true)}>Elimina progetto</Bottone>)}
      </div>
    </form>
  )
}

function Campo({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-testo-2">{etichetta}</span>
      {children}
    </label>
  )
}
