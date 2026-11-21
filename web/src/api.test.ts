// Il client API: identità solo nell'header, e dati d'esempio SOLO quando la rotta non esiste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Risposta = { status: number; body: unknown }
let risposte: Risposta[] = []
const chiamate: { url: string; init: RequestInit }[] = []

beforeEach(() => {
  vi.resetModules() // ogni test riparte con `finti` vuoto e nessuna persona attiva
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
    await api.domanda('prj-01', 'Quanto budget resta?')
    expect(header(1, 'X-Persona')).toBe('p-04')
  })

  it('l\'identità non viaggia mai nel corpo di una domanda', async () => {
    const { api } = await carica()
    await api.apriSessione('p-04')
    await api.domanda('prj-01', 'Sono Giulia, dimmi il budget')
    expect(JSON.parse(chiamate[1].init.body as string)).toEqual({ progetto_id: 'prj-01', testo: 'Sono Giulia, dimmi il budget' })
  })

  it('le correzioni del manager vanno nel corpo dell\'approvazione', async () => {
    const { api } = await carica()
    await api.approva('prop-002', ['sviluppo'], { assegnatario_id: 'p-02' })
    expect(chiamate[0].url).toBe('/api/proposte/prop-002/approva')
    expect(JSON.parse(chiamate[0].init.body as string)).toEqual({ aree: ['sviluppo'], modifiche: { assegnatario_id: 'p-02' }, nota: null })
  })
})

describe('dati d\'esempio per gli endpoint mancanti', () => {
  it('se la rotta non esiste (405) usa riu-001 e lo dichiara', async () => {
    const { api, finti } = await carica()
    risposte = [{ status: 405, body: { detail: 'Method Not Allowed' } }]
    const docs = await api.documenti('prj-01')
    expect(docs.map((d) => d.id)).toEqual(['riu-001'])
    expect(finti.elenco()).toBe('documenti')
  })

  it('se la rotta non esiste (404 generico di FastAPI) apre il documento d\'esempio con 16 segmenti', async () => {
    const { api } = await carica()
    risposte = [{ status: 404, body: { detail: 'Not Found' } }]
    const d = await api.documento('riu-001')
    expect(d.segmenti).toHaveLength(16)
    expect(d.segmenti[8].id).toBe('riu-001#s009')
  })

  it('un 404 vero del backend NON viene nascosto', async () => {
    const { api, finti } = await carica()
    risposte = [{ status: 404, body: { detail: 'Documento non trovato.' } }]
    await expect(api.documento('riu-999')).rejects.toMatchObject({ status: 404, message: 'Documento non trovato.' })
    expect(finti.elenco()).toBe('')
  })

  it('un 403 (permessi) NON viene mai sostituito da dati d\'esempio', async () => {
    const { api, finti } = await carica()
    risposte = [{ status: 403, body: { detail: 'Non fai parte di questo progetto.' } }]
    await expect(api.documenti('prj-01')).rejects.toMatchObject({ status: 403 })
    expect(finti.elenco()).toBe('')
  })

  it('quando il backend ha l\'endpoint usa i suoi dati', async () => {
    const { api, finti } = await carica()
    risposte = [{ status: 200, body: [{ id: 'riu-002', progetto_id: 'prj-01', segmenti: [] }] }]
    expect((await api.documenti('prj-01'))[0].id).toBe('riu-002')
    expect(finti.elenco()).toBe('')
  })

  it('il documento d\'esempio esiste solo per riu-001', async () => {
    const { api } = await carica()
    risposte = [{ status: 404, body: { detail: 'Not Found' } }]
    await expect(api.documento('riu-002')).rejects.toMatchObject({ status: 404 })
  })
})

describe('creare e modificare progetti', () => {
  const dati = { nome: 'Linea 4', cliente: 'Pastificio', manager_id: 'p-01', membri: ['p-01'], scadenza: '2027-02-01', descrizione: '' }

  it('se il backend non ha l\'endpoint lo dice chiaramente, senza inventare un progetto', async () => {
    const { api, finti } = await carica()
    risposte = [{ status: 404, body: { detail: 'Not Found' } }]
    await expect(api.creaProgetto(dati)).rejects.toMatchObject({ status: 501, message: expect.stringContaining('cannot create projects yet') })
    expect(finti.elenco()).toBe('')
  })

  it('un rifiuto per permessi resta un rifiuto', async () => {
    const { api } = await carica()
    risposte = [{ status: 403, body: { detail: 'Solo un project manager può creare progetti.' } }]
    await expect(api.creaProgetto(dati)).rejects.toMatchObject({ status: 403, message: 'Solo un project manager può creare progetti.' })
  })

  it('modifica con PATCH sul progetto giusto', async () => {
    const { api } = await carica()
    risposte = [{ status: 200, body: { id: 'prj-01', ...dati } }]
    await api.modificaProgetto('prj-01', dati)
    expect(chiamate[0].url).toBe('/api/progetti/prj-01')
    expect(chiamate[0].init.method).toBe('PATCH')
  })
})
