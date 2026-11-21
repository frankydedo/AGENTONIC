import clsx from 'clsx'
import { addDays, differenceInCalendarDays, format, isWeekend, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { Flag, Lock } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../contesto'
import { inizioTask, oggi } from '../lib'
import type { Persona, StatoTask, Task } from '../tipi'
import { RigaTask } from './Todo'
import { Avatar, Modale, etichettaStato } from './ui'

const GIORNO = 30      // px per giorno
const RIGA = 44        // altezza di una riga di task
const GRUPPO = 40      // altezza dell'intestazione di una persona
const SINISTRA = 260   // colonna dei nomi

const COLORI: Record<StatoTask, string> = {
  da_fare: 'bg-[#6e6e73] dark:bg-[#636366] hover:brightness-110 text-white',
  in_corso: 'bg-accento hover:brightness-110 text-white',
  bloccato: 'bg-rosso hover:brightness-110 text-white',
  fatto: 'bg-verde hover:brightness-110 text-white',
  annullato: 'bg-testo-3 text-white',
}

type Riga = { tipo: 'gruppo'; persona: Persona | null; n: number } | { tipo: 'task'; t: Task; da: Date; a: Date; aperto: boolean }

/** Gantt dei task per persona: dalla riunione in cui nascono alla scadenza. */
export function Gantt({ task, filtro }: { task: Task[]; filtro?: string }) {
  const { persone, progetto } = useApp()
  const [scelto, setScelto] = useState<Task | null>(null)
  const scorri = useRef<HTMLDivElement>(null)

  const { righe, inizio, giorni } = useMemo(() => {
    const visibili = filtro ? task.filter((t) => t.assegnatario_id === filtro) : task
    const date = (t: Task) => {
      const da = parseISO(inizioTask(t) ?? t.scadenza ?? oggi().toISOString())
      const a = t.scadenza ? parseISO(t.scadenza) : addDays(da, 7)
      return { da: a < da ? a : da, a, aperto: !t.scadenza }
    }
    const perPersona = new Map<string, Task[]>()
    for (const t of visibili) {
      const k = t.assegnatario_id ?? ''
      perPersona.set(k, [...(perPersona.get(k) ?? []), t])
    }
    const righe: Riga[] = []
    const ordine = [...perPersona.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : (persone[a]?.nome ?? a).localeCompare(persone[b]?.nome ?? b)))
    for (const k of ordine) {
      const ts = perPersona.get(k)!.sort((x, y) => (x.scadenza ?? '').localeCompare(y.scadenza ?? ''))
      righe.push({ tipo: 'gruppo', persona: persone[k] ?? null, n: ts.length })
      for (const t of ts) righe.push({ tipo: 'task', t, ...date(t) })
    }
    // un task che aspetta un altro parte quando quello scade (es. la HMI dopo la lista dei tag)
    const perId = new Map(righe.flatMap((r) => (r.tipo === 'task' ? [[r.t.id, r] as const] : [])))
    for (const r of perId.values()) {
      const fineDipendenze = r.t.dipende_da.map((d) => perId.get(d)?.a).filter(Boolean) as Date[]
      const dopo = fineDipendenze.length ? new Date(Math.max(...fineDipendenze.map(Number))) : null
      if (dopo && dopo > r.da) r.da = dopo > r.a ? r.a : dopo
    }
    const estremi = righe.flatMap((r) => (r.tipo === 'task' ? [r.da, r.a] : [])).concat(oggi(), parseISO(progetto.scadenza))
    const min = addDays(new Date(Math.min(...estremi.map(Number))), -3)
    const max = addDays(new Date(Math.max(...estremi.map(Number))), 4)
    return { righe, inizio: min, giorni: differenceInCalendarDays(max, min) }
  }, [task, filtro, persone, progetto.scadenza])

  const x = (d: Date) => differenceInCalendarDays(d, inizio) * GIORNO
  const xOggi = x(oggi())
  const xCollaudo = x(parseISO(progetto.scadenza))

  useEffect(() => {
    scorri.current?.scrollTo({ left: Math.max(0, xOggi - 4 * GIORNO), behavior: 'smooth' })
  }, [xOggi])

  // posizione verticale di ogni task, per disegnare le dipendenze
  const y: Record<string, number> = {}
  let cursore = 0
  for (const r of righe) {
    if (r.tipo === 'gruppo') cursore += GRUPPO
    else { y[r.t.id] = cursore + RIGA / 2; cursore += RIGA }
  }
  const altezza = cursore
  const fine: Record<string, number> = {}
  const avvio: Record<string, number> = {}
  for (const r of righe) if (r.tipo === 'task') { fine[r.t.id] = x(r.a) + GIORNO; avvio[r.t.id] = x(r.da) }

  const giorniArr = Array.from({ length: giorni }, (_, i) => addDays(inizio, i))
  const mesi: { etichetta: string; da: number; n: number }[] = []
  for (const [i, d] of giorniArr.entries()) {
    const m = format(d, 'LLLL yyyy', { locale: it })
    if (mesi.at(-1)?.etichetta === m) mesi.at(-1)!.n++
    else mesi.push({ etichetta: m, da: i, n: 1 })
  }
  const larghezza = giorni * GIORNO

  if (!righe.length) return <p className="p-8 text-center text-sm text-testo-2">Nessun task da mostrare.</p>

  return (
    <>
      <div ref={scorri} className="relative overflow-x-auto">
        <div style={{ width: SINISTRA + larghezza }}>
          {/* intestazione: mesi e giorni */}
          <div className="sticky top-0 z-30 flex border-b border-separatore bg-superficie/90 backdrop-blur-xl">
            <div style={{ width: SINISTRA }} className="sticky left-0 z-10 flex shrink-0 items-end border-r border-separatore bg-superficie px-4 pb-2 text-xs font-semibold text-testo-2">
              Persona e task
            </div>
            <div style={{ width: larghezza }}>
              <div className="relative h-6">
                {mesi.map((m) => (
                  <span key={m.etichetta} style={{ left: m.da * GIORNO, width: m.n * GIORNO }}
                    className="absolute top-1 truncate border-l border-separatore pl-2 text-xs font-bold first-letter:uppercase first:border-l-0">
                    {m.etichetta}
                  </span>
                ))}
              </div>
              <div className="flex">
                {giorniArr.map((d) => (
                  <span key={+d} style={{ width: GIORNO }}
                    className={clsx('cifre shrink-0 py-1 text-center text-[11px] leading-tight', +d === +oggi() ? 'rounded-t-md bg-arancio font-bold text-testo' : isWeekend(d) ? 'text-testo-3' : 'text-testo-2')}>
                    {format(d, 'EEEEE', { locale: it })}<br />{format(d, 'd')}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* corpo */}
          <div className="relative">
            {/* sfondo: weekend, oggi, collaudo */}
            <div className="pointer-events-none absolute top-0 bottom-0" style={{ left: SINISTRA, width: larghezza }}>
              {giorniArr.map((d, i) => isWeekend(d) && <div key={i} className="absolute top-0 bottom-0 bg-[repeating-linear-gradient(135deg,transparent_0_5px,var(--separatore)_5px_6px)]" style={{ left: i * GIORNO, width: GIORNO }} />)}
              <div className="absolute top-0 bottom-0 w-[2px] bg-arancio" style={{ left: xOggi + GIORNO / 2 }} />
              <div className="absolute top-0 bottom-0 border-l-2 border-separatore-forte" style={{ left: xCollaudo + GIORNO / 2 }}>
                <span className="absolute top-1 left-0 inline-flex items-center gap-1 rounded-r-md bg-accento px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-white">
                  <Flag size={10} /> Collaudo
                </span>
              </div>
            </div>

            {/* dipendenze */}
            <svg className="pointer-events-none absolute top-0 z-[3]" style={{ left: SINISTRA }} width={larghezza} height={altezza}>
              <defs>
                <marker id="freccia" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" className="fill-rosso" />
                </marker>
              </defs>
              {righe.flatMap((r) => r.tipo !== 'task' ? [] : r.t.dipende_da.filter((d) => y[d] != null).map((d) => {
                const x1 = fine[d], y1 = y[d], x2 = avvio[r.t.id], y2 = y[r.t.id]
                // successore che parte dopo: gomito verso il suo inizio; se parte lo stesso giorno
                // (o prima), la freccia scende sul bordo superiore della sua barra
                const traccia = x2 >= x1 + 16
                  ? `M${x1},${y1} H${x1 + 8} V${y2} H${x2}`
                  : `M${x1},${y1} H${x1 + 8} V${y2 - RIGA / 2 + 9}`
                return <path key={`${d}-${r.t.id}`} d={traccia} fill="none"
                  className="stroke-rosso" strokeWidth={1.5} strokeDasharray="4 3" markerEnd="url(#freccia)" />
              }))}
            </svg>

            {righe.map((r, i) => r.tipo === 'gruppo' ? (
              <div key={`g${i}`} className="flex border-b border-separatore bg-riempimento/70" style={{ height: GRUPPO }}>
                <div style={{ width: SINISTRA }} className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-separatore bg-riempimento px-4">
                  <Avatar persona={r.persona} size={24} />
                  <span className="truncate text-sm font-bold">{r.persona?.nome ?? 'Senza responsabile'}</span>
                  <span className="cifre ml-auto text-xs text-testo-2">{r.n}</span>
                </div>
              </div>
            ) : (
              <div key={r.t.id} className="group flex border-b border-separatore" style={{ height: RIGA }}>
                <button onClick={() => setScelto(r.t)} style={{ width: SINISTRA }}
                  className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-separatore bg-superficie px-4 pl-12 text-left text-sm group-hover:bg-riempimento">
                  {r.t.dipende_da.length > 0 && <Lock size={12} className="shrink-0 text-rosso-testo" />}
                  <span className="truncate">{r.t.titolo}</span>
                </button>
                <div className="relative" style={{ width: larghezza }}>
                  <button
                    onClick={() => setScelto(r.t)}
                    title={`${r.t.titolo} · ${etichettaStato(r.t.stato)}`}
                    style={{ left: x(r.da) + 2, width: Math.max(GIORNO - 4, x(r.a) - x(r.da) + GIORNO - 4), top: 9, height: RIGA - 18 }}
                    className={clsx('absolute z-[2] flex items-center overflow-hidden rounded-full px-3 text-[12.5px] font-semibold whitespace-nowrap shadow-sm transition', COLORI[r.t.stato],
                      r.aperto && 'opacity-60 [mask-image:linear-gradient(90deg,#000_70%,transparent)]')}
                  >
                    {r.t.titolo}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-separatore px-5 py-3 text-xs text-testo-2">
        {(['da_fare', 'in_corso', 'bloccato', 'fatto'] as StatoTask[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5"><span className={clsx('h-2.5 w-2.5 rounded-full', COLORI[s])} />{etichettaStato(s)}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2px] bg-arancio" />Oggi</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 border-l-2 border-separatore-forte" />Collaudo</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-rosso" />Dipendenza</span>
        <span className="ml-auto">La barra va dalla riunione in cui nasce il task alla sua scadenza.</span>
      </div>

      <Modale aperto={!!scelto} onChiudi={() => setScelto(null)} titolo="Dettaglio del task">
        {scelto && <RigaTask t={scelto} />}
      </Modale>
    </>
  )
}
