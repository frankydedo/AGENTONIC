import clsx from 'clsx'
import { format } from 'date-fns'
import { ArrowRight, CalendarClock, Check, CircleAlert, Crown, Eye, FolderPlus, Pencil } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import { Avatar, Badge, Bottone, Card, ChipArea, Modale, TitoloPagina } from '../componenti/ui'
import { useApp } from '../contesto'
import { giorniA, inInglese, oggi, puoCreareProgetti, puoModificare, scadenzaRelativa, validaProgetto } from '../lib'
import type { DatiProgetto, Progetto } from '../tipi'

/**
 * Tutti i progetti di cui la persona è membro (lo decide il backend). Chi ne ha più di uno li
 * naviga da qui; chi ha ruolo «project manager» ne crea di nuovi; il manager di un progetto lo modifica.
 */
export function Progetti() {
  const { io, progetti } = useApp()
  const [modulo, setModulo] = useState<{ aperto: boolean; progetto: Progetto | null }>({ aperto: false, progetto: null })
  const creatore = puoCreareProgetti(io)
  const ordinati = [...progetti].sort((a, b) => Number(b.manager_id === io.id) - Number(a.manager_id === io.id) || a.scadenza.localeCompare(b.scadenza))

  return (
    <>
      <TitoloPagina
        titolo="Projects"
        sottotitolo={creatore
          ? 'The projects you take part in. You can create new ones and decide who works on them and who leads them.'
          : 'You only see the projects you are assigned to. Inside each one you only see what falls within your areas.'}
        azioni={creatore && <Bottone variante="primario" icona={FolderPlus} onClick={() => setModulo({ aperto: true, progetto: null })}>New project</Bottone>}
      />
      <ul className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {ordinati.map((p, i) => (
          <motion.li key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <SchedaProgetto p={p} onModifica={() => setModulo({ aperto: true, progetto: p })} />
          </motion.li>
        ))}
      </ul>
      <Modale aperto={modulo.aperto} onChiudi={() => setModulo({ aperto: false, progetto: null })}
        titolo={modulo.progetto ? `Edit “${modulo.progetto.nome}”` : 'New project'}>
        <ModuloProgetto key={modulo.progetto?.id ?? 'nuovo'} progetto={modulo.progetto} onFatto={() => setModulo({ aperto: false, progetto: null })} />
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
          {sonoManager ? <Badge tono="viola" icona={Crown}>You are the manager</Badge> : <Badge>Member</Badge>}
          {attuale && <Badge tono="giallo" icona={Check}>Open now</Badge>}
          <Badge tono={scad.tono} icona={CalendarClock}>{giorniA(p.scadenza) > 1 ? `due ${scad.testo}` : scad.testo}</Badge>
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
          <span className="text-xs text-testo-2">{p.membri.length} people</span>
        </div>

        {!sonoManager && (
          <p className="mt-4 flex flex-wrap items-center gap-1 text-xs text-testo-2">
            <Eye size={13} /> Here you see: {io.competenze.map((a) => <ChipArea key={a} area={a} />)}
          </p>
        )}
      </div>

      <div className="mx-5 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-riempimento/70 px-3.5 py-3">
          <p className="cifre text-[24px] leading-none font-bold">{conti ? conti.miei : '·'}</p>
          <p className="mt-1 text-xs text-testo-2">your open tasks</p>
        </div>
        <div className="rounded-2xl bg-riempimento/70 px-3.5 py-3">
          {sonoManager
            ? <><p className={clsx('cifre text-[24px] leading-none font-bold', conti?.daDecidere && 'text-arancio-testo')}>{conti?.daDecidere ?? '·'}</p><p className="mt-1 text-xs text-testo-2">proposals to decide</p></>
            : <><p className="text-[24px] leading-none font-bold text-testo-3">—</p><p className="mt-1 text-xs text-testo-2">the manager decides them</p></>}
        </div>
      </div>

      <div className="flex gap-2 p-5 pt-4">
        <Bottone variante={attuale ? 'secondario' : 'primario'} icona={ArrowRight} className="flex-1" onClick={() => scegliProgetto(p.id)}>
          {attuale ? 'Go to overview' : 'Open the project'}
        </Bottone>
        {puoModificare(io, p) && <Bottone icona={Pencil} onClick={onModifica} aria-label={`Edit ${p.nome}`}>Edit</Bottone>}
      </div>
    </Card>
  )
}

const INPUT = 'w-full rounded-xl bg-riempimento px-3.5 py-2.5 text-[15px] text-testo transition placeholder:text-testo-3 focus:bg-superficie focus:ring-3 focus:ring-accento/35 focus:outline-none'

/** Crea (progetto = null) o modifica un progetto. Nessun dato finto: se il backend non può, lo dice. */
function ModuloProgetto({ progetto, onFatto }: { progetto: Progetto | null; onFatto: () => void }) {
  const { io, persone, ricaricaProgetti, scegliProgetto } = useApp()
  const tutte = Object.values(persone)
  const [d, setD] = useState<DatiProgetto>(progetto
    ? { nome: progetto.nome, cliente: progetto.cliente, manager_id: progetto.manager_id, membri: progetto.membri, scadenza: progetto.scadenza, descrizione: progetto.descrizione }
    : { nome: '', cliente: '', manager_id: io.id, membri: [io.id], scadenza: '', descrizione: '' })
  const [tentato, setTentato] = useState(false)
  const [erroreBackend, setErroreBackend] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
  const errori = validaProgetto(d, format(oggi(), 'yyyy-MM-dd'))

  const alternaMembro = (id: string) => setD((x) => ({
    ...x, membri: x.membri.includes(id) ? x.membri.filter((m) => m !== id || m === x.manager_id) : [...x.membri, id],
  }))
  const scegliManager = (id: string) => setD((x) => ({ ...x, manager_id: id, membri: x.membri.includes(id) ? x.membri : [...x.membri, id] }))

  const salva = async () => {
    setTentato(true)
    setErroreBackend(null)
    if (errori.length) return
    setOccupato(true)
    try {
      const salvato = progetto ? await api.modificaProgetto(progetto.id, d) : await api.creaProgetto(d)
      await ricaricaProgetti()
      toast.success(progetto ? 'Project updated' : 'Project created', { description: salvato.nome })
      onFatto()
      if (!progetto) scegliProgetto(salvato.id)
    } catch (e) {
      setErroreBackend((e as Error).message)
    } finally {
      setOccupato(false)
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); salva() }} className="space-y-4">
      <Campo etichetta="Project name">
        <input value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} className={INPUT} placeholder="E.g. Line 4 revamp" />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etichetta="Client">
          <input value={d.cliente} onChange={(e) => setD({ ...d, cliente: e.target.value })} className={INPUT} placeholder="E.g. Pastificio Valsangone S.p.A." />
        </Campo>
        <Campo etichetta="Deadline">
          <input type="date" value={d.scadenza} onChange={(e) => setD({ ...d, scadenza: e.target.value })} className={INPUT} />
        </Campo>
      </div>
      <Campo etichetta="Description">
        <textarea value={d.descrizione} onChange={(e) => setD({ ...d, descrizione: e.target.value })} rows={2} className={INPUT} />
      </Campo>
      <Campo etichetta="Manager (approves Agentonic's proposals and sees the whole project)">
        <select value={d.manager_id} onChange={(e) => scegliManager(e.target.value)} className={INPUT}>
          {tutte.map((p) => <option key={p.id} value={p.id}>{p.nome}, {inInglese(p.ruolo)}</option>)}
        </select>
      </Campo>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-testo-2">Who works on it ({d.membri.length})</legend>
        <ul className="grid max-h-56 gap-1 overflow-y-auto rounded-2xl bg-riempimento/60 p-1.5 sm:grid-cols-2">
          {tutte.map((p) => {
            const manager = p.id === d.manager_id
            return (
              <li key={p.id}>
                <label className={clsx('flex items-center gap-2.5 rounded-xl px-2 py-1.5', manager ? 'opacity-80' : 'cursor-pointer hover:bg-superficie')}>
                  <input type="checkbox" checked={d.membri.includes(p.id)} disabled={manager} onChange={() => alternaMembro(p.id)} className="h-[18px] w-[18px] accent-[var(--accento)]" />
                  <Avatar persona={p} size={22} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{p.nome}</span>
                    <span className="block truncate text-[11px] text-testo-2">{manager ? 'manager' : inInglese(p.reparto ?? p.ruolo)}</span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        <p className="mt-1.5 text-xs text-testo-2">Each member will see only the parts of the project that fall within their areas.</p>
      </fieldset>

      {tentato && errori.length > 0 && (
        <ul className="rounded-2xl bg-arancio-tenue px-3.5 py-2.5 text-sm text-arancio-testo">{errori.map((e) => <li key={e}>• {e}</li>)}</ul>
      )}
      {erroreBackend && (
        <p className="flex gap-2 rounded-2xl bg-rosso-tenue px-3.5 py-2.5 text-sm text-rosso-testo"><CircleAlert size={16} className="mt-0.5 shrink-0" />{erroreBackend}</p>
      )}

      <div className="flex gap-2">
        <Bottone type="submit" variante="primario" icona={Check} disabled={occupato}>{progetto ? 'Save changes' : 'Create the project'}</Bottone>
        <Bottone type="button" variante="secondario" onClick={onFatto}>Cancel</Bottone>
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
