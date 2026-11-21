import { describe, expect, it } from 'vitest'
import { cercaPersone } from './persone'
import type { Persona } from './tipi'

const p = (id: string, nome: string, ruolo = 'tecnico', extra: Partial<Persona> = {}): Persona =>
  ({ id, nome, ruolo, alias: [], competenze: ['generale'], ...extra })

const azienda = [
  p('p-01', 'Giulia Ferraris', 'project manager', { competenze: ['budget'] }),
  p('p-02', 'Marco Bianchi', 'senior PLC programmer', { competenze: ['sviluppo'] }),
  p('p-03', 'Marco Rinaldi', 'tecnico quadri elettrici'),
  p('p-06', 'Elena Russo', 'responsabile acquisti', { reparto: 'Acquisti' }),
  p('p-09', 'Niccolò Ferri', 'magazziniere'),
]

describe('ricerca delle persone all\'ingresso', () => {
  const ids = (q: string) => cercaPersone(azienda, q).risultati.map((x) => x.id)

  it('prima chi ha il nome che inizia così, poi chi ha una parola che inizia così', () => {
    expect(ids('ferr')).toEqual(['p-01', 'p-09'])       // Ferraris e Ferri, alfabetico a parità
    expect(ids('ma')).toEqual(['p-02', 'p-03', 'p-01', 'p-09'])  // Marco, Marco, poi i ruoli «manager» e «magazziniere»
  })

  it('tutte le parole devono corrispondere', () => {
    expect(ids('marco rinal')).toEqual(['p-03'])
    expect(ids('marco acquisti')).toEqual([])
  })

  it('trova anche per ruolo, reparto e competenza; ignora maiuscole e accenti', () => {
    expect(ids('acquisti')).toEqual(['p-06'])
    expect(ids('BUDGET')).toEqual(['p-01'])
    expect(ids('engineering')).toEqual(['p-02'])   // l'area «sviluppo», come la vede l'interfaccia
    expect(ids('niccolo')).toEqual(['p-09'])
  })

  it('testo vuoto: nessun risultato (la pagina mostra i recenti)', () => {
    expect(cercaPersone(azienda, '   ')).toEqual({ risultati: [], totale: 0 })
  })

  it('regge migliaia di persone e ne restituisce al massimo 50, con il totale', () => {
    const molti = Array.from({ length: 5000 }, (_, i) => p(`p-${i}`, `Persona ${i} Rossi`, i % 2 ? 'tecnico' : 'commerciale'))
    const inizio = performance.now()
    const { risultati, totale } = cercaPersone(molti, 'rossi')
    expect(performance.now() - inizio).toBeLessThan(200)
    expect(totale).toBe(5000)
    expect(risultati).toHaveLength(50)
  })
})
