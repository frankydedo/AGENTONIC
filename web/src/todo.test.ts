import { describe, expect, it } from 'vitest'
import { todoStimata } from './componenti/Todo'
import type { Task } from './tipi'

const t = (id: string, assegnatario_id: string | null, scadenza: string | null, stato: Task['stato'] = 'da_fare'): Task => ({
  id, progetto_id: 'prj-01', titolo: id, assegnatario_id, scadenza, stato, aree: ['sviluppo'], dipende_da: [], citazioni: [],
})

describe('to-do del giorno stimata (quando il backend non la dà)', () => {
  const task = [
    t('task-003', 'p-04', '2026-12-04', 'bloccato'),
    t('task-001', 'p-04', '2026-11-25'),
    t('task-009', 'p-04', null),
    t('task-004', 'p-04', '2026-11-20', 'fatto'),
    t('task-005', 'p-04', '2026-11-20', 'annullato'),
    t('task-002', 'p-02', '2026-11-22'),
  ]

  it('contiene solo i task aperti della persona, dal più urgente', () => {
    expect(todoStimata(task, 'p-04').map((x) => x.id)).toEqual(['task-001', 'task-003', 'task-009'])
  })

  it('non mostra mai i task di altri', () => {
    expect(todoStimata(task, 'p-02').map((x) => x.id)).toEqual(['task-002'])
    expect(todoStimata(task, 'p-07')).toEqual([])
  })
})
