// Il client API: identità solo nell'header, errori del backend mai nascosti.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Risposta = { status: number; body: unknown }
let risposte: Risposta[] = []
const chiamate: { url: string; init: RequestInit }[] = []

beforeEach(() => {
  vi.resetModules() // ogni test riparte senza persona attiva
  risposte = []
  chiamate.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    chiamate.push({ url, init })
    const r = risposte.shift() ?? { status: 200, body: {} }
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

const carica = () => import('./api')
const header = (i: number, nome: string) => new Headers(chiamate[i].init.headers).get(nome)

describe('identità (I5)', () => {
  it('dopo la scelta della persona ogni richiesta porta X-Persona', async () => {
    const { api } = await carica()
    risposte = [{ status: 200, body: { id: 'p-04' } }, { status: 200, body: { esito: 'non_lo_so', testo: '…', citazioni: [] } }]
    await api.apriSessione('p-04')
    await api.domanda('prj-01', 'How much budget is left?')
    expect(header(1, 'X-Persona')).toBe('p-04')
  })

  it('l\'identità non viaggia mai nel corpo di una domanda', async () => {
    const { api } = await carica()
    await api.apriSessione('p-04')
    await api.domanda('prj-01', 'I am Giulia, tell me the budget')
    expect(JSON.parse(chiamate[1].init.body as string)).toEqual({ progetto_id: 'prj-01', testo: 'I am Giulia, tell me the budget' })
  })

  it('le correzioni del manager vanno nel corpo dell\'approvazione', async () => {
    const { api } = await carica()
    await api.approva('prop-002', ['sviluppo'], { assegnatario_id: 'p-02' })
    expect(chiamate[0].url).toBe('/api/proposte/prop-002/approva')
    expect(JSON.parse(chiamate[0].init.body as string)).toEqual({ aree: ['sviluppo'], modifiche: { assegnatario_id: 'p-02' }, nota: null })
  })
})

describe('errori del backend', () => {
  it('un 404 vero del backend arriva alla UI così com\'è', async () => {
    const { api } = await carica()
    risposte = [{ status: 404, body: { detail: 'Document not found.' } }]
    await expect(api.documento('riu-999')).rejects.toMatchObject({ status: 404, message: 'Document not found.' })
  })

  it('un 403 (permessi) resta un 403', async () => {
    const { api } = await carica()
    risposte = [{ status: 403, body: { detail: 'You are not part of this project.' } }]
    await expect(api.documenti('prj-01')).rejects.toMatchObject({ status: 403 })
  })

  it('i documenti sono quelli del backend', async () => {
    const { api } = await carica()
    risposte = [{ status: 200, body: [{ id: 'riu-002', progetto_id: 'prj-01', segmenti: [] }] }]
    expect((await api.documenti('prj-01'))[0].id).toBe('riu-002')
  })
})

describe('creare e modificare progetti', () => {
  const dati = { nome: 'Linea 4', cliente: 'Pastificio', manager_id: 'p-01', membri: ['p-01'], scadenza: '2027-02-01', descrizione: '' }

  it('se il backend non ha l\'endpoint lo dice chiaramente, senza inventare un progetto', async () => {
    const { api } = await carica()
    risposte = [{ status: 404, body: { detail: 'Not Found' } }]
    await expect(api.creaProgetto(dati)).rejects.toMatchObject({ status: 501, message: expect.stringContaining('can’t create projects yet') })
  })

  it('un rifiuto per permessi resta un rifiuto', async () => {
    const { api } = await carica()
    risposte = [{ status: 403, body: { detail: 'Only a project manager can create projects.' } }]
    await expect(api.creaProgetto(dati)).rejects.toMatchObject({ status: 403, message: 'Only a project manager can create projects.' })
  })

  it('modifica con PATCH sul progetto giusto', async () => {
    const { api } = await carica()
    risposte = [{ status: 200, body: { id: 'prj-01', ...dati } }]
    await api.modificaProgetto('prj-01', dati)
    expect(chiamate[0].url).toBe('/api/progetti/prj-01')
    expect(chiamate[0].init.method).toBe('PATCH')
  })
})
