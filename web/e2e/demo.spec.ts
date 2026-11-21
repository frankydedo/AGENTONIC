// Il percorso della demo, dall'interfaccia, contro il BACKEND VERO (db nuovo, modello finto).
// Lo scenario è in sequenza, come in demo: riu-001 caricata e approvata per intero (stesso ordine di
// dati/attese/controlli.json, così le risposte registrate del modello finto combaciano), poi riu-002
// caricata e lasciata in attesa per correggere e rifiutare dal vivo.
import { expect, request, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { BACKEND_URL } from '../playwright.config'

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  const api = await request.newContext({ baseURL: BACKEND_URL, extraHTTPHeaders: { 'X-Persona': 'p-01' } })
  const carica = async (id: string) => {
    const r = await api.post('/riunioni?progetto_id=prj-01', {
      multipart: { file: { name: `${id}.md`, mimeType: 'text/markdown', buffer: readFileSync(`../dati/riunioni/${id}.md`) } },
    })
    expect(r.ok(), `caricamento di ${id}: ${await r.text()}`).toBeTruthy()
  }
  await carica('riu-001')
  const proposte: { id: string; documento_id: string }[] = await (await api.get('/proposte?progetto_id=prj-01&stato=in_attesa')).json()
  for (const p of proposte.filter((x) => x.documento_id === 'riu-001').sort((a, b) => a.id.localeCompare(b.id))) {
    expect((await api.post(`/proposte/${p.id}/approva`, { data: { aree: null } })).ok()).toBeTruthy()
  }
  await carica('riu-002')
  await api.dispose()
})

// Ogni test fallisce se compare un errore JavaScript o una risposta 5xx del backend.
// I 403/404/405 sono attesi (permessi negati, endpoint non ancora presenti) e non contano.
let errori: string[] = []
test.beforeEach(async ({ page }) => {
  errori = []
  page.on('pageerror', (e) => errori.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errori.push(`console: ${m.text()}`) })
  page.on('response', (r) => { if (r.status() >= 500) errori.push(`${r.status()} ${r.url()}`) })
})
test.afterEach(() => { expect(errori, 'errori nel browser').toEqual([]) })

async function entraCome(page: Page, personaId: string, percorso = '/') {
  await page.addInitScript((id) => sessionStorage.setItem('agentonic-persona', id), personaId)
  await page.goto(percorso)
}

async function chiedi(page: Page, domanda: string) {
  await page.getByPlaceholder('Ask a question about the project…').fill(domanda)
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
}

const fonte = (page: Page) => page.locator('li', { has: page.getByText('Selected source') })

test('si entra scegliendo chi si è', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Who are you?')).toBeVisible()
  await page.getByRole('button', { name: /Giulia Ferraris/ }).click()
  await expect(page.getByRole('heading', { name: /Giulia$/ })).toBeVisible()
  await expect(page.getByText('Proposals to decide')).toBeVisible()
})

test('controllo 1: Agentonic parla per primo, senza che nessuno chieda', async ({ page }) => {
  await entraCome(page, 'p-01')
  await expect(page.getByText('Listening: alerts arrive on their own')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark as resolved' }).first()).toBeVisible()
})

test('controlli 2 e 6: il manager corregge una proposta e la approva', async ({ page }) => {
  await entraCome(page, 'p-01', '/documenti/riu-002')
  // la scheda si trova dalla sua fonte (s006): in correzione il titolo sta in un campo di testo
  const carta = page.locator('li').filter({ has: page.getByText('New task') }).filter({ has: page.getByRole('link', { name: /s006/ }) })
  await carta.getByRole('button', { name: 'Correct' }).click()
  await carta.getByLabel('Who handles it').selectOption('p-05')
  await carta.getByRole('button', { name: 'Approve with corrections' }).click()

  await expect(page.getByText('Corrected and approved')).toBeVisible()
  await expect(carta.getByText('Approved', { exact: true })).toBeVisible()
  await expect(carta.getByText('Luca Gallo')).toBeVisible()
  await expect(carta.getByText('Approved by Giulia Ferraris')).toBeVisible()
})

test('controllo 6: una proposta rifiutata resta fuori dalla memoria', async ({ page }) => {
  await entraCome(page, 'p-01', '/documenti/riu-002')
  const carta = page.locator('li').filter({ has: page.getByText('New fact') }).filter({ hasText: 'riutilizzabili' })
  await carta.getByRole('button', { name: 'Reject' }).click()
  await expect(carta.getByText('Rejected', { exact: true })).toBeVisible()
  await expect(carta.getByRole('button', { name: 'Approve' })).toHaveCount(0)
})

test('controllo 4: la citazione apre la fonte con la frase evidenziata', async ({ page }) => {
  await entraCome(page, 'p-01')
  await page.getByRole('link', { name: /s0\d\d/ }).first().click()
  await expect(page).toHaveURL(/\/documenti\/riu-00\d\?seg=s\d{3}$/)
  await expect(fonte(page)).toBeVisible()
  await expect(fonte(page)).toBeInViewport()
})

test('controlli 3 e 4: chi ha la competenza budget riceve la risposta con la fonte', async ({ page }) => {
  await entraCome(page, 'p-02', '/chiedi')
  await chiedi(page, 'Quanto budget resta?')
  await expect(page.getByText(/Restano 35\.500 €/)).toBeVisible()
  await page.getByRole('link', { name: /s00\d/ }).first().click()
  await expect(page).toHaveURL(/seg=s00\d$/)
  await expect(fonte(page)).toBeVisible()
})

test('controlli 3 e 5: chi non ha la competenza riceve la risposta neutra, senza fonti', async ({ page }) => {
  await entraCome(page, 'p-04', '/chiedi')
  await chiedi(page, 'Quanto budget resta?')
  await expect(page.getByText('Non ho informazioni che puoi vedere su questo. Puoi chiedere a Giulia Ferraris.')).toBeVisible()
  await expect(page.getByText('No source you can see')).toBeVisible()
  await expect(page.getByText('35.500')).toHaveCount(0)
})

test('un membro non vede proposte, avvisi riservati e registro', async ({ page }) => {
  await entraCome(page, 'p-04')
  await expect(page.getByText('Your day')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Log' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mark as resolved' })).toHaveCount(0)
  await page.goto('/registro')
  await expect(page.getByText('Manager only')).toBeVisible()
})

test('Paola vede solo il suo progetto (ISO 9001), non la linea 3', async ({ page }) => {
  await entraCome(page, 'p-08', '/progetti')
  await expect(page.getByText('Certificazione ISO 9001').first()).toBeVisible()
  await expect(page.getByText('Revamping linea di confezionamento 3')).toHaveCount(0)
})

test('controllo 7: Gantt e to-do per persona', async ({ page }) => {
  await entraCome(page, 'p-01', '/team')
  await expect(page.getByRole('button', { name: /schermate della nuova HMI/i }).last()).toBeVisible()
  await expect(page.getByText('Acceptance test').first()).toBeVisible()
  await page.getByRole('button', { name: 'By person' }).click()
  const sara = page.locator('section', { hasText: 'Sara Colombo' }).first()
  await expect(sara.getByText(/schermate della nuova HMI/i).first()).toBeVisible()
})

test('regressione: dopo molti ricaricamenti il backend risponde ancora', async ({ page }) => {
  // prima della correzione ogni ricaricamento lasciava appesa la connessione SSE e dopo 6
  // Chrome bloccava tutte le chiamate (la chat restava in attesa)
  await entraCome(page, 'p-02')
  for (let i = 0; i < 8; i++) await page.reload()
  await page.getByRole('link', { name: 'Ask Agentonic' }).first().click()
  await chiedi(page, 'Quanto budget resta?')
  await expect(page.getByText(/Restano 35\.500 €/)).toBeVisible()
})

test('il manager carica una riunione e vede Agentonic lavorare passo per passo', async ({ page }) => {
  await entraCome(page, 'p-01')
  await page.getByRole('button', { name: 'Upload meeting' }).click()
  const finestra = page.getByRole('dialog', { name: 'Upload a meeting' })
  await finestra.locator('input[type=file]').setInputFiles('../dati/riunioni/riu-003.md')
  await expect(finestra.getByText('Analysis complete')).toBeVisible({ timeout: 20_000 })
  await expect(finestra.getByText('proposals to decide')).toBeVisible()
  await expect(finestra.getByText(/^Agentonic /).first()).toBeVisible()
  await finestra.getByRole('button', { name: 'Review the proposals' }).click()
  await expect(page).toHaveURL(/\/documenti\/riu-003$/)
})

test('il registro si legge in inglese semplice, i dati grezzi solo nei dettagli tecnici', async ({ page }) => {
  await entraCome(page, 'p-01', '/registro')
  await expect(page.getByText(/Giulia Ferraris approved proposal/).first()).toBeVisible()
  await expect(page.getByText(/^Agentonic /).first()).toBeVisible()
  await expect(page.locator('pre').first()).toBeHidden()
  await page.getByText('Technical details').first().click()
  await expect(page.locator('pre').first()).toBeVisible()
})

test('si sceglie il progetto tra quelli di cui si è membri', async ({ page }) => {
  await entraCome(page, 'p-01')
  await page.getByRole('button', { name: /Revamping linea di confezionamento 3/ }).first().click()
  await expect(page.getByText(/Your projects \(\d+\)/)).toBeVisible()
})

test('aspetto: si passa al tema scuro e la scelta resta dopo il ricaricamento', async ({ page }) => {
  await entraCome(page, 'p-01')
  await page.getByRole('button', { name: /Giulia Ferraris/ }).first().click()
  await page.getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('il project manager vede i suoi progetti e il modulo per crearne uno', async ({ page }) => {
  await entraCome(page, 'p-01', '/progetti')
  const scheda = page.locator('li', { hasText: 'Revamping linea di confezionamento 3' }).first()
  await expect(scheda.getByText('You are the manager')).toBeVisible()
  await expect(scheda.getByRole('button', { name: /Edit/ })).toBeVisible()

  await page.getByRole('button', { name: 'New project' }).click()
  const modulo = page.getByRole('dialog', { name: 'New project' })
  await modulo.getByRole('button', { name: 'Create the project' }).click()
  await expect(modulo.getByText('Give the project a name.')).toBeVisible()

  await modulo.getByPlaceholder('E.g. Line 4 revamp').fill('Revamping linea 4')
  await modulo.getByPlaceholder('E.g. Pastificio Valsangone S.p.A.').fill('Pastificio Valsangone S.p.A.')
  await modulo.locator('input[type=date]').fill('2027-03-31')
  await modulo.getByRole('button', { name: 'Create the project' }).click()
  // finché il backend non ha POST /progetti: errore chiaro, nessun progetto finto
  await expect(modulo.getByText(/cannot create projects yet/)).toBeVisible()
})

test('un membro vede solo i suoi progetti, senza crearne né modificarli', async ({ page }) => {
  await entraCome(page, 'p-04', '/progetti')
  const scheda = page.locator('li', { hasText: 'Revamping linea di confezionamento 3' }).first()
  await expect(scheda.getByText('Member', { exact: true })).toBeVisible()
  await expect(scheda.getByText('Here you see:')).toBeVisible()
  await expect(page.getByRole('button', { name: 'New project' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Edit/ })).toHaveCount(0)
})
