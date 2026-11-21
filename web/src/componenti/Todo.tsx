import clsx from 'clsx'
import { CalendarCheck, Check, Lock, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, ErroreApi } from '../api'
import { useApp } from '../contesto'
import { useDati } from '../dati'
import { dataBreve } from '../lib'
import type { Task, TodoOggi as TTodoOggi } from '../tipi'
import { Avatar, Badge, Bottone, Card, ChipArea, Citazioni, IntestazioneCard, Scadenza, Scheletro, StatoBadge, Vuoto } from './ui'

export function RigaTask({ t, conAssegnatario = true, compatta = false }: { t: Task; conAssegnatario?: boolean; compatta?: boolean }) {
  const { persone } = useApp()
  const { task } = useDati()
  const assegnatario = t.assegnatario_id ? persone[t.assegnatario_id] : null
  const bloccanti = t.dipende_da.map((id) => task.find((x) => x.id === id)).filter(Boolean) as Task[]
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className={clsx('text-[15px] font-semibold', t.stato === 'fatto' && 'text-testo-3 line-through')}>{t.titolo}</span>
        <StatoBadge stato={t.stato} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-testo-2">
        {conAssegnatario && (assegnatario
          ? <span className="inline-flex items-center gap-1.5 text-testo"><Avatar persona={assegnatario} size={20} />{assegnatario.nome}</span>
          : <Badge tono="giallo">No owner</Badge>)}
        <span>by {dataBreve(t.scadenza)}</span>
        <Scadenza iso={t.scadenza} stato={t.stato} />
        {!compatta && t.aree.map((a) => <ChipArea key={a} area={a} />)}
      </div>
      {bloccanti.length > 0 && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-rosso-testo">
          <Lock size={13} strokeWidth={2.4} className="mt-0.5 shrink-0" /> Waiting for: {bloccanti.map((b) => `${b.titolo} (${persone[b.assegnatario_id ?? '']?.nome ?? '?'})`).join(', ')}
        </p>
      )}
      {!compatta && <Citazioni citazioni={t.citazioni} className="mt-2" />}
    </div>
  )
}

/** Se il backend non dà la to-do del giorno di un'altra persona, la stimiamo dai task del progetto. */
export function todoStimata(task: Task[], personaId: string): Task[] {
  return task
    .filter((t) => t.assegnatario_id === personaId && t.stato !== 'fatto' && t.stato !== 'annullato')
    .sort((a, b) => (a.scadenza ?? '9999').localeCompare(b.scadenza ?? '9999'))
}

/** La to-do del giorno di una persona: la propria si accetta al mattino. */
export function useTodoOggi(personaId: string) {
  const { io } = useApp()
  const { task } = useDati()
  const [todo, setTodo] = useState<TTodoOggi | null>(null)
  const [stimata, setStimata] = useState(false)

  useEffect(() => {
    let vivo = true
    setTodo(null)
    api.todoOggi(personaId)
      .then((t) => { if (vivo) { setTodo(t); setStimata(false) } })
      .catch((e) => {
        if (!vivo) return
        if (e instanceof ErroreApi && e.status === 403 && personaId !== io.id) {
          setTodo({ persona_id: personaId, data: new Date().toISOString().slice(0, 10), accettata: false, task: todoStimata(task, personaId) })
          setStimata(true)
        } else {
          toast.error('Couldn’t load the to-do list', { description: (e as Error).message })
        }
      })
    return () => { vivo = false }
  }, [personaId, io.id, task])

  return { todo, setTodo, stimata }
}

export function TodoOggi() {
  const { io } = useApp()
  const { todo, setTodo } = useTodoOggi(io.id)
  const [tolti, setTolti] = useState<Set<string>>(new Set())

  const accetta = async () => {
    if (!todo) return
    try {
      setTodo(await api.accettaTodo(todo.task.filter((t) => !tolti.has(t.id)).map((t) => t.id)))
      toast.success('Day accepted', { description: 'Have a good day! You can change it during the day.' })
    } catch (e) {
      toast.error('Couldn’t accept the day', { description: (e as Error).message })
    }
  }
  const alterna = (id: string) => setTolti((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <Card>
      <IntestazioneCard
        icona={Sun}
        titolo="Your day"
        sottotitolo={todo?.accettata ? 'Accepted: this is your plan for today.' : 'Agentonic prepared it from the approved tasks. Remove what you won’t do today and accept it.'}
        azioni={todo && (todo.accettata ? <Badge tono="verde" icona={Check}>Accepted</Badge> : <Badge tono="giallo">To accept</Badge>)}
      />
      {!todo ? <Scheletro righe={2} /> : todo.task.length === 0 ? (
        <Vuoto icona={CalendarCheck} titolo="No tasks for today" testo="When the manager approves new tasks assigned to you, they appear here." />
      ) : (
        <div className="pb-5">
          <ul className="divide-y divide-separatore">
            {todo.task.map((t) => (
              <li key={t.id} className={clsx('flex gap-3.5 px-5 py-3.5 transition-opacity', tolti.has(t.id) && 'opacity-40')}>
                {!todo.accettata && (
                  <input type="checkbox" checked={!tolti.has(t.id)} onChange={() => alterna(t.id)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accento)]" aria-label={`Include today: ${t.titolo}`} />
                )}
                <RigaTask t={t} conAssegnatario={false} />
              </li>
            ))}
          </ul>
          {!todo.accettata && <div className="px-5 pt-2"><Bottone variante="primario" icona={Check} className="w-full sm:w-auto" onClick={accetta}>Accept the day</Bottone></div>}
        </div>
      )}
    </Card>
  )
}
