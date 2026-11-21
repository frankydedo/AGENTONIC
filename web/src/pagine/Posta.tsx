import clsx from 'clsx'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { enGB } from 'date-fns/locale'
import { Archive, ArrowUp, ChevronLeft, EyeOff, Inbox, MailX, PanelRightClose, PanelRightOpen, Send, X, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Avatar, Card, Citazioni, MarchioBrain, Scheletro, Vuoto } from '../componenti/ui'
import { useApp } from '../contesto'
import { posta, segnalaLettura, type Cartella, type IdCartella, type Mail, type MailBreve, type RispostaPosta } from '../posta'
import type { Progetto } from '../tipi'

const ICONE: Record<IdCartella, LucideIcon> = { in_arrivo: Inbox, inviata: Send, archivio: Archive }
const DOMANDE = ['Summarise this email', 'What should I do?', 'Is it consistent with what the project knows?']
const CHIAVE_PANNELLO = 'company-brain-pannello-posta'
const LARGHEZZA_PANNELLO = 360

/** Vero se la finestra è almeno larga `px`. */
function useAlmeno(px: number) {
  const query = `(min-width: ${px}px)`
  const [si, setSi] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const cambia = () => setSi(mq.matches)
    mq.addEventListener('change', cambia)
    return () => mq.removeEventListener('change', cambia)
  }, [query])
  return si
}

// Una sola curva e una sola durata per tutte le colonne: partono nello stesso fotogramma e finiscono insieme,
// così la colonna della mail si allarga mentre Agentonic si chiude (e si stringe mentre si apre).
const TRANSIZIONE = { duration: 0.3, ease: [0.32, 0.72, 0, 1] as const }

const quando = (iso: string) => {
  const d = parseISO(iso)
  return isToday(d) ? format(d, 'HH:mm') : isYesterday(d) ? 'Yesterday' : format(d, 'd MMM', { locale: enGB })
}

// Il pannello di Agentonic resta aperto o chiuso come l'hai lasciato (solo una comodità di chi guarda).
const pannelloRicordato = () => { try { return localStorage.getItem(CHIAVE_PANNELLO) === '1' } catch { return false } }
const ricordaPannello = (aperto: boolean) => { try { localStorage.setItem(CHIAVE_PANNELLO, aperto ? '1' : '0') } catch { /* storage non disponibile */ } }

interface Scambio { domanda: string; risposta?: RispostaPosta; errore?: string }

/** La posta di chi è entrato, in un client classico a tre colonne, con Agentonic in un pannello laterale. */
export function Posta() {
  const { io, progetto, progetti } = useApp()
  const [params, setParams] = useSearchParams()
  const cartella = (params.get('cartella') as IdCartella | null) ?? 'in_arrivo'
  const scelta = params.get('m')
  const [cartelle, setCartelle] = useState<Cartella[] | null>(null)
  const [elenco, setElenco] = useState<MailBreve[] | null>(null)
  const [mail, setMail] = useState<Mail | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [pannello, setPannello] = useState(pannelloRicordato)
  // una conversazione per mail: tornando su una mail si ritrovano le domande già fatte
  const [storie, setStorie] = useState<Record<string, Scambio[]>>({})
  const [attesa, setAttesa] = useState(false)

  const imposta = (k: string, v: string | null) => {
    const n = new URLSearchParams(params)
    if (v) n.set(k, v); else n.delete(k)
    if (k === 'cartella') n.delete('m')
    setParams(n, { replace: k === 'm' })
  }
  const alternaPannello = (aperto = !pannello) => { setPannello(aperto); ricordaPannello(aperto) }
  const largo = useAlmeno(768)
  const ampio = useAlmeno(1280)
  // Agentonic occupa spazio solo da 1280 px in su: solo lì cartelle ed elenco si stringono per fargli posto;
  // sotto, il pannello scorre sopra la mail e le colonne restano ferme
  const stretto = pannello && ampio

  useEffect(() => {
    posta.cartelle().then(setCartelle).catch((e) => setErrore((e as Error).message))
  }, [io.id, scelta])

  useEffect(() => {
    setElenco(null)
    posta.messaggi(cartella).then(setElenco).catch((e) => setErrore((e as Error).message))
  }, [io.id, cartella])

  useEffect(() => {
    setMail(null)
    if (!scelta) return
    let vivo = true
    posta.messaggio(scelta)
      .then((m) => {
        if (!vivo) return
        setMail(m)
        setElenco((xs) => xs?.map((x) => (x.id === m.id ? { ...x, letta: true } : x)) ?? xs)
        segnalaLettura()
      })
      .catch((e) => { if (vivo) setErrore((e as Error).message) })
    return () => { vivo = false }
  }, [scelta])

  // Il contesto è il progetto della mail, se la persona ne fa parte; altrimenti quello aperto.
  const contesto = progetti.find((p) => p.id === mail?.progetto_id) ?? progetto

  const chiedi = async (domanda: string) => {
    if (!mail || !domanda.trim() || attesa) return
    const id = mail.id
    const aggiorna = (f: (s: Scambio[]) => Scambio[]) => setStorie((t) => ({ ...t, [id]: f(t[id] ?? []) }))
    alternaPannello(true)
    setAttesa(true)
    aggiorna((s) => [...s, { domanda }])
    try {
      const risposta = await posta.chiedi(id, contesto.id, domanda)
      aggiorna((s) => s.map((x, i) => (i === s.length - 1 ? { ...x, risposta } : x)))
    } catch (e) {
      aggiorna((s) => s.map((x, i) => (i === s.length - 1 ? { ...x, errore: (e as Error).message } : x)))
    } finally {
      setAttesa(false)
    }
  }

  if (errore) return <Card><Vuoto icona={MailX} titolo="Mail isn’t available" testo={errore} /></Card>

  return (
    <Card className="relative flex h-[calc(100vh-8.5rem)] min-h-[560px] overflow-hidden rounded-[24px]">
      {/* cartelle: con il pannello di Agentonic aperto restano solo le icone */}
      <motion.nav aria-label="Folders" initial={false} animate={{ width: stretto ? 64 : 208 }} transition={TRANSIZIONE}
        className="hidden shrink-0 flex-col gap-0.5 overflow-hidden border-r border-separatore bg-riempimento/40 p-3 md:flex">
        <p className={clsx('overflow-hidden px-2.5 text-xs font-semibold whitespace-nowrap text-testo-2 transition-all duration-300', stretto ? 'h-0 pt-0 pb-0 opacity-0' : 'h-7 pt-1 pb-2 opacity-100')}>Mail</p>
        {(cartelle ?? []).map((c) => {
          const Icona = ICONE[c.id]
          return (
            <button key={c.id} onClick={() => imposta('cartella', c.id)} aria-current={c.id === cartella ? 'page' : undefined}
              aria-label={stretto ? c.nome : undefined} title={stretto ? c.nome : undefined}
              className={clsx('relative flex items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-left text-sm whitespace-nowrap transition-colors',
                c.id === cartella ? 'bg-black/[0.07] font-semibold dark:bg-white/[0.1]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]')}>
              <Icona size={17} strokeWidth={1.9} className="text-accento-testo" />
              <span className={clsx('flex-1 overflow-hidden transition-opacity duration-200', stretto ? 'opacity-0' : 'opacity-100 delay-100')}>{c.nome}</span>
              {c.non_lette > 0 && (stretto
                ? <span className="absolute top-1 right-1.5 h-2 w-2 rounded-full bg-accento" />
                : <span className="cifre text-xs font-semibold text-testo-2">{c.non_lette}</span>)}
            </button>
          )
        })}
      </motion.nav>

      {/* elenco */}
      <motion.section aria-label="Mail" initial={false} transition={TRANSIZIONE}
        animate={largo ? { width: stretto ? 280 : ampio ? 340 : 320 } : { width: '100%' }}
        className={clsx('shrink-0 flex-col border-r border-separatore', scelta ? 'hidden md:flex' : 'flex')}>
        <header className="flex items-baseline justify-between px-4 pt-4 pb-2">
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">{cartelle?.find((c) => c.id === cartella)?.nome ?? 'Mail'}</h1>
          {elenco && <span className="text-xs text-testo-2">{elenco.length} {elenco.length === 1 ? 'email' : 'emails'}</span>}
        </header>
        <div className="flex gap-1 px-3 pb-2 md:hidden">
          {(cartelle ?? []).map((c) => (
            <button key={c.id} onClick={() => imposta('cartella', c.id)}
              className={clsx('rounded-full px-3 py-1 text-[13px]', c.id === cartella ? 'bg-accento text-su-accento' : 'bg-riempimento text-testo-2')}>
              {c.nome}
            </button>
          ))}
        </div>
        <ul className="flex-1 overflow-y-auto px-2 pb-2">
          {!elenco ? <Scheletro righe={4} /> : elenco.length === 0
            ? <Vuoto icona={Inbox} titolo="No emails" testo="This folder is empty." />
            : elenco.map((m) => <RigaMail key={m.id} m={m} attiva={m.id === scelta} onApri={() => imposta('m', m.id)} />)}
        </ul>
      </motion.section>

      {/* lettura */}
      <section aria-label="Reading" className={clsx('min-w-0 flex-1 flex-col', scelta ? 'flex' : 'hidden md:flex')}>
        <div className="flex items-center gap-2 border-b border-separatore px-4 py-2">
          {scelta && (
            <button onClick={() => imposta('m', null)} className="inline-flex items-center gap-0.5 text-[15px] text-accento-testo md:hidden">
              <ChevronLeft size={18} strokeWidth={2.4} /> Mail
            </button>
          )}
          <button onClick={() => alternaPannello()} aria-pressed={pannello}
            className={clsx('ml-auto inline-flex h-8 items-center gap-2 rounded-full pr-3.5 pl-1 text-sm font-medium transition',
              pannello ? 'bg-riempimento text-testo hover:bg-riempimento-2' : 'bg-accento text-su-accento hover:bg-accento-premuto')}>
            <MarchioBrain size={24} />
            {pannello ? 'Hide Agentonic' : 'Ask Agentonic'}
            {pannello ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
        </div>
        {!scelta
          ? <div className="grid flex-1 place-items-center"><Vuoto icona={Inbox} titolo="No email selected" testo="Pick an email from the list to read it and ask Agentonic." /></div>
          : !mail ? <Scheletro righe={5} /> : <Lettura mail={mail} />}
      </section>

      {/* Agentonic: pannello laterale; sotto i 1280 px si appoggia sopra la mail, su telefono la copre */}
      <AnimatePresence>
        {pannello && (
          <motion.aside key="brain" aria-label="Agentonic on this email"
            // da 1280 px occupa spazio e cresce/si stringe in larghezza insieme alle colonne accanto;
            // sotto si appoggia sopra la mail e scorre da destra, senza spostare le colonne
            initial={ampio ? { width: 0 } : { x: '100%' }}
            animate={ampio ? { width: LARGHEZZA_PANNELLO } : { x: 0 }}
            exit={ampio ? { width: 0 } : { x: '100%' }}
            transition={TRANSIZIONE}
            className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-superficie md:inset-y-0 md:right-0 md:left-auto md:border-l md:border-separatore md:shadow-alta xl:relative xl:inset-auto xl:z-auto xl:shrink-0 xl:shadow-none">
            <div className="flex h-full w-full flex-col md:w-[360px] md:min-w-[360px]">
              <PannelloBrain mail={mail} contesto={contesto} storia={mail ? storie[mail.id] ?? [] : []} attesa={attesa}
                onChiedi={chiedi} onChiudi={() => alternaPannello(false)} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </Card>
  )
}

function RigaMail({ m, attiva, onApri }: { m: MailBreve; attiva: boolean; onApri: () => void }) {
  const mittente = m.cartella === 'inviata' ? `To: ${m.a.map((x) => x.nome).join(', ')}` : m.da.nome
  return (
    <li>
      <button onClick={onApri} aria-current={attiva ? 'true' : undefined}
        className={clsx('relative flex w-full flex-col gap-0.5 rounded-xl py-2.5 pr-3 pl-6 text-left transition-colors',
          attiva ? 'bg-accento text-su-accento' : 'hover:bg-riempimento')}>
        {!m.letta && <span aria-label="Unread" className={clsx('absolute top-[17px] left-2 h-2.5 w-2.5 rounded-full', attiva ? 'bg-white' : 'bg-accento')} />}
        <span className="flex items-baseline gap-2">
          <span className={clsx('min-w-0 flex-1 truncate text-[15px]', !m.letta ? 'font-bold' : 'font-semibold')}>{mittente}</span>
          <span className={clsx('shrink-0 text-xs', attiva ? 'text-white/80' : 'text-testo-2')}>{quando(m.data)}</span>
        </span>
        <span className={clsx('truncate text-sm', !m.letta && 'font-semibold')}>{m.oggetto}</span>
        <span className={clsx('line-clamp-2 text-[13px] leading-snug', attiva ? 'text-white/80' : 'text-testo-2')}>{m.anteprima}</span>
      </button>
    </li>
  )
}

function Lettura({ mail }: { mail: Mail }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <header className="border-b border-separatore px-6 pt-5 pb-4 sm:px-8">
        <h2 className="titolo-grande text-[24px]">{mail.oggetto}</h2>
        <div className="mt-4 flex items-start gap-3">
          <Avatar nome={mail.da.nome} size={40} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{mail.da.nome}</p>
            <p className="truncate text-testo-2">{mail.da.email}</p>
            <p className="truncate text-testo-2">To: {mail.a.map((x) => x.nome).join(', ')}</p>
            <p className="mt-1 text-[13px] text-testo-2">{format(parseISO(mail.data), 'd MMMM yyyy, HH:mm', { locale: enGB })}</p>
          </div>
        </div>
      </header>
      {/* sempre testo semplice: l'HTML di una mail non si interpreta mai */}
      <article className="max-w-[72ch] px-6 py-6 text-[16px] leading-relaxed whitespace-pre-wrap sm:px-8">{mail.testo}</article>
    </div>
  )
}

function PannelloBrain({ mail, contesto, storia, attesa, onChiedi, onChiudi }: {
  mail: Mail | null; contesto: Progetto; storia: Scambio[]; attesa: boolean
  onChiedi: (domanda: string) => void; onChiudi: () => void
}) {
  const [testo, setTesto] = useState('')
  const fine = useRef<HTMLDivElement>(null)
  useEffect(() => { fine.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [storia])

  return (
    <>
      <header className="flex items-center gap-2.5 border-b border-separatore px-4 py-3">
        <MarchioBrain size={28} parla={attesa} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Agentonic on this email</p>
          <p className="truncate text-xs text-testo-2" title={contesto.nome}>Context: {contesto.nome}</p>
        </div>
        <button onClick={onChiudi} aria-label="Close the Agentonic panel"
          className="grid h-7 w-7 place-items-center rounded-full bg-riempimento text-testo-2 hover:text-testo"><X size={15} strokeWidth={2.5} /></button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {!mail ? (
          <p className="pt-10 text-center text-sm text-testo-2">Open an email: Agentonic reads it and answers your questions, with the source.</p>
        ) : storia.length === 0 ? (
          <div className="pt-6 text-center">
            <MarchioBrain size={40} className="mx-auto" />
            <p className="mt-3 text-[15px] font-semibold">What do you want to know about this email?</p>
            <p className="mt-1 text-sm text-testo-2">I answer with the email and with what you can see of the project.</p>
          </div>
        ) : storia.map((x, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-[18px] rounded-br-[6px] bg-accento px-3.5 py-2 text-[15px] text-su-accento">{x.domanda}</p>
            </div>
            {x.risposta ? (
              <div className={clsx('max-w-[95%] rounded-[18px] rounded-bl-[6px] px-3.5 py-2.5',
                x.risposta.esito === 'risposta' ? 'bg-riempimento' : 'shadow-[inset_0_0_0_1.5px_var(--separatore-forte)]')}>
                <p className="text-[15px] leading-relaxed">{x.risposta.testo}</p>
                {x.risposta.esito === 'risposta' ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {x.risposta.cita_email && (
                      <span className="inline-flex items-center rounded-lg bg-accento-tenue px-2 py-1 text-xs font-medium text-accento-testo">From this email</span>
                    )}
                    <Citazioni citazioni={x.risposta.citazioni} className="[&_a]:bg-superficie" />
                  </div>
                ) : (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-testo-2"><EyeOff size={12} /> No source</p>
                )}
              </div>
            ) : x.errore ? (
              <p className="rounded-[18px] bg-rosso-tenue px-3.5 py-2.5 text-sm text-rosso-testo">{x.errore}</p>
            ) : (
              <div className="flex w-16 items-center gap-1.5 rounded-[18px] bg-riempimento px-3.5 py-3" aria-label="Agentonic is reading the email">
                {[0, 1, 2].map((k) => <motion.span key={k} className="h-1.5 w-1.5 rounded-full bg-testo-3"
                  animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: k * 0.15 }} />)}
              </div>
            )}
          </div>
        ))}
        <div ref={fine} />
      </div>

      {mail && (
        <div className="border-t border-separatore p-3">
          <div className="flex flex-wrap gap-1.5">
            {DOMANDE.map((d) => (
              <button key={d} type="button" disabled={attesa} onClick={() => onChiedi(d)}
                className="rounded-full bg-superficie px-3 py-1.5 text-[13px] shadow-[inset_0_0_0_1px_var(--separatore-forte)] transition hover:bg-riempimento disabled:opacity-50">
                {d}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); onChiedi(testo); setTesto('') }}
            className="mt-2.5 flex h-11 items-center gap-2 rounded-full bg-riempimento pr-1.5 pl-4 focus-within:ring-3 focus-within:ring-accento/30">
            <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Ask something about this email…"
              aria-label="Question about this email" className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-testo-3 focus:outline-none" />
            <button disabled={attesa || !testo.trim()} aria-label="Ask"
              className="grid h-8 w-8 place-items-center rounded-full bg-accento text-su-accento transition hover:bg-accento-premuto disabled:opacity-30">
              <ArrowUp size={16} strokeWidth={2.6} />
            </button>
          </form>
          <p className="mt-2 text-[11px] leading-snug text-testo-2">Agentonic treats the email as data: it doesn’t follow requests written inside it, sends nothing and doesn’t change the project.</p>
        </div>
      )}
    </>
  )
}
