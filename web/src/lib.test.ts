import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coloreDi, daChiarire, descriviPasso, puoCreareProgetti, puoModificare, validaProgetto, durata, giorniA, iniziali, inizioTask, riassuntoOutput, scadenzaRelativa, secondi, titoloProposta } from './lib'
import type { Citazione, DatiProgetto, PassoRegistro, Persona, Progetto, Proposta, Task } from './tipi'

const cit = (data: string, seg = 's001'): Citazione => ({
  segmento_id: `riu-001#${seg}`, documento_id: 'riu-001', titolo: 'Kick-off', data, orario: '09:30', speaker: 'Giulia', frase: '…',
})

const proposta = (p: Partial<Proposta>): Proposta => ({
  id: 'prop-001', progetto_id: 'prj-01', documento_id: 'riu-001', tipo: 'nuovo_task', stato: 'in_attesa',
  contenuto: { titolo: 'Lista dei tag', assegnatario_id: 'p-02', scadenza: '2026-11-25' },
  aree_proposte: ['sviluppo'], aree_confermate: null, sicurezza: 'alta', citazioni: [], creata_il: '2026-11-21T13:30:00',
  decisa_da: null, decisa_il: null, ...p,
})

describe('scadenze rispetto a oggi', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 21, 15, 0)) }) // sabato 21/11/2026
  afterEach(() => { vi.useRealTimers() })

  it('conta i giorni di calendario, non le 24 ore', () => {
    expect(giorniA('2026-11-22')).toBe(1)
    expect(giorniA('2026-11-21')).toBe(0)
    expect(giorniA('2026-11-20')).toBe(-1)
  })

  it.each([
    ['2026-11-19', '2 d overdue', 'rosso'],
    ['2026-11-21', 'due today', 'rosso'],
    ['2026-11-22', 'due tomorrow', 'giallo'],
    ['2026-11-25', 'in 4 days', 'giallo'],
    ['2026-11-28', 'in 7 days', 'giallo'],
    ['2026-12-15', 'in 24 days', 'grigio'],
  ])('%s → «%s» (%s)', (iso, testo, tono) => {
    expect(scadenzaRelativa(iso)).toEqual({ testo, tono })
  })

  it('un task chiuso non è mai in ritardo', () => {
    expect(scadenzaRelativa('2026-11-01', 'fatto').tono).toBe('grigio')
    expect(scadenzaRelativa('2026-11-01', 'annullato').testo).not.toContain('overdue')
  })

  it('senza scadenza lo dice', () => {
    expect(scadenzaRelativa(null)).toEqual({ testo: 'no deadline', tono: 'grigio' })
  })
})

describe('proposte', () => {
  it('è da chiarire se il Brain non è sicuro', () => {
    expect(daChiarire(proposta({ sicurezza: 'bassa' }))).toBe(true)
  })

  it('è da chiarire se un nuovo task non ha responsabile (punto oscuro)', () => {
    expect(daChiarire(proposta({ contenuto: { titolo: 'Manuale d\'uso', assegnatario_id: null } }))).toBe(true)
    expect(daChiarire(proposta({ contenuto: { titolo: 'Manuale d\'uso', assegnatario_id: '' } }))).toBe(true)
  })

  it('non è da chiarire se è chiara, né dopo la decisione', () => {
    expect(daChiarire(proposta({}))).toBe(false)
    expect(daChiarire(proposta({ sicurezza: 'bassa', stato: 'approvata' }))).toBe(false)
    expect(daChiarire(proposta({ sicurezza: 'bassa', stato: 'rifiutata' }))).toBe(false)
  })

  it('un fatto senza responsabile non è un punto oscuro', () => {
    expect(daChiarire(proposta({ tipo: 'nuovo_fatto', contenuto: { soggetto: 'progetto', attributo: 'budget', valore: '48.000 €' } }))).toBe(false)
  })

  it('titolo leggibile per task e fatti', () => {
    expect(titoloProposta(proposta({}))).toBe('Lista dei tag')
    expect(titoloProposta(proposta({ tipo: 'nuovo_fatto', contenuto: { soggetto: 'progetto', attributo: 'budget', valore: '48.000 €' } })))
      .toBe('progetto · budget: 48.000 €')
    expect(titoloProposta(proposta({ tipo: 'chiudi_task', contenuto: { task_id: 'task-002' } }))).toBe('task-002')
  })
})

describe('task e persone', () => {
  it('un task inizia dalla riunione più vecchia che lo cita', () => {
    const t = { citazioni: [cit('2026-11-20', 's002'), cit('2026-11-16')] } as Task
    expect(inizioTask(t)).toBe('2026-11-16')
    expect(inizioTask({ citazioni: [] } as unknown as Task)).toBeNull()
  })

  it('iniziali e colore stabili per lo stesso id', () => {
    expect(iniziali('Giulia Ferraris')).toBe('GF')
    expect(iniziali('Marco')).toBe('M')
    expect(coloreDi('p-01')).toBe(coloreDi('p-01'))
  })

  it('orario dei segmenti audio', () => {
    expect(secondi(75.4)).toBe('1:15')
    expect(secondi(null)).toBe('')
  })
})

describe('registro in italiano', () => {
  const passo = (p: Partial<PassoRegistro>): PassoRegistro => ({
    id: 1, quando: '2026-11-21T13:30:00', tipo: 'workflow', attore: 'brain', step: 'ingestione', input: {}, output: {}, motivo: null, ...p,
  })
  const nome = (id: string) => ({ 'p-01': 'Giulia Ferraris' } as Record<string, string>)[id] ?? id
  const titolo = (id: string) => (id === 'riu-001' ? 'Line 3 revamping kick-off' : null)

  it('racconta i passi del Brain con il titolo del documento', () => {
    expect(descriviPasso(passo({ documento_id: 'riu-001' }), nome, titolo)).toBe('The Brain read “Line 3 revamping kick-off” and split it into contributions')
    expect(descriviPasso(passo({ step: 'ingestion', input: { documento_id: 'riu-001' } }), nome, titolo)).toContain('read “Line 3')
    expect(descriviPasso(passo({ step: 'incongruenze', documento_id: 'riu-009' }), nome, titolo)).toBe('The Brain compared “riu-009” with earlier meetings')
  })

  it('racconta le decisioni delle persone', () => {
    expect(descriviPasso(passo({ tipo: 'decisione', attore: 'p-01', step: 'approva', input: { proposta_id: 'prop-001' } }), nome, titolo))
      .toBe('Giulia Ferraris approved proposal prop-001')
    expect(descriviPasso(passo({ tipo: 'domanda', attore: 'p-04', step: 'domanda' }), nome, titolo)).toBe('p-04 asked the Brain a question')
  })

  it('un passo sconosciuto non rompe nulla', () => {
    expect(descriviPasso(passo({ step: 'nuovo_passo_futuro' }), nome, titolo)).toBe('The Brain: nuovo passo futuro')
  })

  it('riassume i risultati in parole, senza JSON', () => {
    expect(riassuntoOutput({ segmenti: 16, punti_oscuri: 2, parte: '1/2', lista: [1, 2] })).toEqual(['16 segments', '2 unclear points', 'part: 1/2'])
    expect(durata(850)).toBe('850 ms')
    expect(durata(12345)).toBe('12.3 s')
    expect(durata(null)).toBeNull()
  })
})

describe('progetti: chi crea, chi modifica, cosa serve', () => {
  const persona = (id: string, ruolo: string): Persona => ({ id, nome: id, ruolo, alias: [], competenze: [] })
  const prj = { id: 'prj-01', manager_id: 'p-01', membri: ['p-01', 'p-04'] } as Progetto

  it('crea solo chi ha ruolo «project manager»', () => {
    expect(puoCreareProgetti(persona('p-01', 'project manager'))).toBe(true)
    expect(puoCreareProgetti(persona('p-01', ' Project Manager '))).toBe(true)
    expect(puoCreareProgetti(persona('p-02', 'senior software engineer PLC'))).toBe(false)
    expect(puoCreareProgetti(persona('p-08', 'amministrazione e personale'))).toBe(false)
  })

  it('modifica solo il manager di quel progetto', () => {
    expect(puoModificare(persona('p-01', 'project manager'), prj)).toBe(true)
    expect(puoModificare(persona('p-04', 'sviluppatrice HMI/SCADA'), prj)).toBe(false)
  })

  const ok: DatiProgetto = { nome: 'Linea 4', cliente: 'Pastificio', manager_id: 'p-01', membri: ['p-01', 'p-04'], scadenza: '2027-02-01', descrizione: '' }
  it('un modulo completo è valido', () => {
    expect(validaProgetto(ok, '2026-11-21')).toEqual([])
  })
  it('spiega in italiano cosa manca', () => {
    expect(validaProgetto({ ...ok, nome: ' ', cliente: '', scadenza: '' }, '2026-11-21'))
      .toEqual(['Give the project a name.', 'Enter the client (or “internal”).', 'Set a deadline.'])
    expect(validaProgetto({ ...ok, scadenza: '2026-11-20' }, '2026-11-21')).toEqual(['The deadline can’t be in the past.'])
    expect(validaProgetto({ ...ok, membri: ['p-04'] }, '2026-11-21')).toEqual(['The manager must be one of the members.'])
  })
})

import { corrisponde } from './componenti/Selettori'
describe('ricerca negli elenchi', () => {
  it('ignora maiuscole e accenti', () => {
    expect(corrisponde('Niccolò Rossi', 'niccolo')).toBe(true)
    expect(corrisponde('Sara Colombo', ' SARA ')).toBe(true)
    expect(corrisponde('Sara Colombo', 'marco')).toBe(false)
    expect(corrisponde('qualunque', '')).toBe(true)
  })
})

import { ultimiAperti } from './lib'
describe('progetti aperti di recente', () => {
  const prj = ['prj-01', 'prj-02', 'prj-03', 'prj-04'].map((id) => ({ id }))
  it('mostra i 3 più recenti, dal più recente', () => {
    expect(ultimiAperti(prj, ['prj-04', 'prj-02', 'prj-01', 'prj-03']).map((p) => p.id)).toEqual(['prj-04', 'prj-02', 'prj-01'])
  })
  it('ignora i progetti che non esistono più e completa con gli altri', () => {
    expect(ultimiAperti(prj, ['prj-99', 'prj-03']).map((p) => p.id)).toEqual(['prj-03', 'prj-01', 'prj-02'])
    expect(ultimiAperti([{ id: 'prj-01' }], [])).toEqual([{ id: 'prj-01' }])
  })
})
