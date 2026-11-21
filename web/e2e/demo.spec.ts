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
  await page.addInitScript((id) => sessionStorage.setItem('company-brain-persona', id), personaId)
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
  await entraCome(page, 'p-01', '/documents/riu-002')
  // la scheda si trova dalla sua fonte (s006): in correzione il titolo sta in un campo di testo
  const conFonte = (p: Page) => p.locator('li').filter({ has: p.getByText('New task') }).filter({ has: p.getByRole('link', { name: /s006/ }) })
  const carta = conFonte(page)
  await carta.getByRole('button', { name: 'Correct' }).click()
  await carta.getByLabel('Owner').selectOption('p-05')
  // aree: menu a tendina con ricerca
  await carta.getByRole('button', { name: 'Visible to' }).click()
  // il menu sta in un portale sopra tutta la pagina, non dentro la scheda
  await page.getByPlaceholder('Search for an area…').fill('sal')
  await page.getByRole('menuitemcheckbox', { name: /sales/ }).click()
  await page.keyboard.press('Escape')
  await carta.getByRole('button', { name: 'Approve with corrections' }).click()
  await expect(page.getByText('Corrected and approved')).toBeVisible()

  // la proposta decisa passa nel cassetto «Approvate»
  await page.getByRole('button', { name: /^Approved/ }).click()
  const approvata = conFonte(page)
  await expect(approvata.getByText('Approved', { exact: true })).toBeVisible()
  await expect(approvata.getByText('Luca Gallo')).toBeVisible()
  await expect(approvata.getByText('sales')).toBeVisible()
  await expect(approvata.getByText('Approved by Giulia Ferraris')).toBeVisible()
})

test('controllo 6: una proposta rifiutata resta fuori dalla memoria, e si può recuperare', async ({ page }) => {
  await entraCome(page, 'p-01', '/documents/riu-002')
  const carta = () => page.locator('li').filter({ has: page.getByText('New fact') }).filter({ hasText: 'reusable' })
  await carta().getByRole('button', { name: 'Reject' }).click()
  await page.getByRole('button', { name: /^Rejected/ }).click()
  await expect(carta().getByText('Rejected', { exact: true })).toBeVisible()
  await expect(carta().getByRole('button', { name: 'Approve' })).toHaveCount(0)
  // recuperarla: finché il backend non ha POST /proposte/{id}/riapri, errore chiaro
  await carta().getByRole('button', { name: 'Restore' }).click()
  await expect(page.getByText(/can’t restore rejected proposals yet/)).toBeVisible()
})

test('controllo 4: la citazione apre la fonte con la frase evidenziata', async ({ page }) => {
  await entraCome(page, 'p-01')
  await page.getByRole('link', { name: /s0\d\d/ }).first().click()
  await expect(page).toHaveURL(/\/documents\/riu-00\d\?seg=s\d{3}$/)
  await expect(fonte(page)).toBeVisible()
  await expect(fonte(page)).toBeInViewport()
})

test('controlli 3 e 4: chi ha la competenza budget riceve la risposta con la fonte', async ({ page }) => {
  await entraCome(page, 'p-02', '/ask')
  await chiedi(page, 'How much budget is left?')
  await expect(page.getByText(/There's €35,500 left/)).toBeVisible()
  await page.getByRole('link', { name: /s00\d/ }).first().click()
  await expect(page).toHaveURL(/seg=s00\d$/)
  await expect(fonte(page)).toBeVisible()
})

test('controlli 3 e 5: chi non ha la competenza riceve la risposta neutra, senza fonti', async ({ page }) => {
  await entraCome(page, 'p-04', '/ask')
  await chiedi(page, 'How much budget is left?')
  await expect(page.getByText("I don't have any information you can see about this. You can ask Giulia Ferraris.")).toBeVisible()
  await expect(page.getByText('No source you can see')).toBeVisible()
  await expect(page.getByText('35,500')).toHaveCount(0)
})

test('un membro non vede proposte, avvisi riservati e registro', async ({ page }) => {
  await entraCome(page, 'p-04')
  await expect(page.getByText('Your day')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Activity log' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mark as resolved' })).toHaveCount(0)
  await page.goto('/log')
  await expect(page.getByText('Manager only')).toBeVisible()
})

test('Paola vede solo il suo progetto (ISO 9001), non la linea 3', async ({ page }) => {
  await entraCome(page, 'p-08', '/projects')
  await expect(page.getByText('ISO 9001 certification').first()).toBeVisible()
  await expect(page.getByText('Packaging line 3 revamping')).toHaveCount(0)
})

test('controllo 7: Gantt e to-do per persona', async ({ page }) => {
  await entraCome(page, 'p-01', '/team')
  await expect(page.getByRole('button', { name: /new HMI screens/i }).last()).toBeVisible()
  await expect(page.getByText('Acceptance test').first()).toBeVisible()
  await page.getByRole('button', { name: 'By person' }).click()
  const sara = page.locator('section', { hasText: 'Sara Colombo' }).first()
  await expect(sara.getByText(/new HMI screens/i).first()).toBeVisible()
})

test('regressione: dopo molti ricaricamenti il backend risponde ancora', async ({ page }) => {
  // prima della correzione ogni ricaricamento lasciava appesa la connessione SSE e dopo 6
  // Chrome bloccava tutte le chiamate (la chat restava in attesa)
  await entraCome(page, 'p-02')
  for (let i = 0; i < 8; i++) await page.reload()
  await page.getByRole('link', { name: 'Ask Agentonic' }).first().click()
  await chiedi(page, 'How much budget is left?')
  await expect(page.getByText(/There's €35,500 left/)).toBeVisible()
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
  await expect(page).toHaveURL(/\/documents\/riu-003$/)
})

test('il registro si legge in italiano, i dati grezzi solo nei dettagli tecnici', async ({ page }) => {
  await entraCome(page, 'p-01', '/log')
  await expect(page.getByText(/Giulia Ferraris approved proposal/).first()).toBeVisible()
  await expect(page.getByText(/^Agentonic /).first()).toBeVisible()
  await expect(page.locator('pre').first()).toBeHidden()
  await page.getByText('Technical details').first().click()
  await expect(page.locator('pre').first()).toBeVisible()
})

test('si sceglie il progetto tra quelli di cui si è membri', async ({ page }) => {
  await entraCome(page, 'p-01')
  await page.getByRole('button', { name: /Packaging line 3 revamping/ }).first().click()
  await expect(page.getByText('Recently opened')).toBeVisible()
  // al massimo 3 progetti, più il link a tutti; il menu sta in un portale sopra la pagina
  const menu = page.locator('body > div').filter({ hasText: 'Recently opened' }).last()
  expect(await menu.getByRole('button').count()).toBeLessThanOrEqual(3)
  await expect(menu.getByRole('link', { name: /All projects \(\d+\)/ })).toBeVisible()
  await menu.getByRole('link', { name: /All projects/ }).click()
  await expect(page).toHaveURL(/\/projects$/)
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
  await entraCome(page, 'p-01', '/projects')
  const scheda = page.locator('li', { hasText: 'Packaging line 3 revamping' }).first()
  await expect(scheda.getByText('You’re the manager')).toBeVisible()
  await expect(scheda.getByRole('button', { name: /Edit/ })).toBeVisible()

  await page.getByRole('button', { name: 'New project' }).click()
  const modulo = page.getByRole('dialog', { name: 'New project' })
  await modulo.getByRole('button', { name: 'Create project' }).click()
  await expect(modulo.getByText('Give the project a name.')).toBeVisible()

  await modulo.getByPlaceholder('E.g. Line 4 retrofit').fill('Line 4 retrofit')
  await modulo.getByPlaceholder('E.g. Valsangone Pasta Co.').fill('Pastificio Valsangone S.p.A.')
  await modulo.locator('input[type=date]').fill('2027-03-31')
  await modulo.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByText('Project created')).toBeVisible()

  // il nuovo progetto si apre; poi il suo manager lo elimina, con conferma
  await page.goto('/projects')
  const nuova = page.locator('li', { hasText: 'Line 4 retrofit' }).first()
  await expect(nuova.getByText('You’re the manager')).toBeVisible()
  await nuova.getByRole('button', { name: /Edit/ }).click()
  await page.getByRole('button', { name: 'Delete project' }).click()
  await page.getByRole('button', { name: 'Really delete, with all its data' }).click()
  await expect(page.getByText('Project deleted')).toBeVisible()
  await expect(page.getByText('Line 4 retrofit')).toHaveCount(0)
})

test('un membro vede solo i suoi progetti, senza crearne né modificarli', async ({ page }) => {
  await entraCome(page, 'p-04', '/projects')
  const scheda = page.locator('li', { hasText: 'Packaging line 3 revamping' }).first()
  await expect(scheda.getByText('Member', { exact: true })).toBeVisible()
  await expect(scheda.getByText('Here you see:')).toBeVisible()
  await expect(page.getByRole('button', { name: 'New project' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Edit/ })).toHaveCount(0)
})

test('impostazioni: si passa dal tema chiaro allo scuro', async ({ page }) => {
  await entraCome(page, 'p-04')
  await page.getByRole('link', { name: 'Settings' }).first().click()
  await page.getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('i cassetti delle proposte si aprono e si chiudono', async ({ page }) => {
  await entraCome(page, 'p-01', '/documents/riu-002')
  const daDecidere = page.getByRole('button', { name: /^To decide/ })
  await expect(daDecidere).toHaveAttribute('aria-expanded', 'true')
  const unaProposta = page.locator('li').filter({ has: page.getByText('Update task') }).first()
  await expect(unaProposta).toBeVisible()
  await daDecidere.click()
  await expect(daDecidere).toHaveAttribute('aria-expanded', 'false')
  await expect(unaProposta).toBeHidden()
  await daDecidere.click()
  await expect(unaProposta).toBeVisible()
})

test('le persone si cercano: inoltro di un avviso', async ({ page }) => {
  await entraCome(page, 'p-01')
  await page.getByRole('button', { name: 'Forward' }).first().click()
  const finestra = page.getByRole('dialog', { name: 'Forward the alert' })
  await finestra.getByPlaceholder(/Search \d+ people/).fill('sara')
  await expect(finestra.getByRole('menuitemcheckbox')).toHaveCount(1)
  await finestra.getByRole('menuitemcheckbox', { name: /Sara Colombo/ }).click()
  await expect(finestra.getByRole('menuitemcheckbox', { name: /Sara Colombo/ })).toHaveAttribute('aria-checked', 'true')
})

test('posta: Agentonic risponde su una mail citandola, e la mail-trappola resta un dato', async ({ page }) => {
  await entraCome(page, 'p-01', '/mail')
  await page.getByRole('button', { name: /Updated inverter quote/ }).click()
  await page.getByRole('button', { name: 'Ask Agentonic' }).click()
  const brain = page.getByRole('complementary', { name: 'Agentonic on this email' })
  await brain.getByRole('button', { name: 'Is it consistent with what the project knows?' }).click()
  await expect(brain.getByText(/from €6,200 to €7,400/)).toBeVisible()
  await expect(brain.getByText('From this email')).toBeVisible()

  // il pannello resta aperto cambiando mail; ogni mail ha la sua conversazione
  await page.getByRole('button', { name: /new 2027 component price list/ }).click()
  await expect(brain.getByText(/from €6,200 to €7,400/)).toHaveCount(0)
  await brain.getByRole('button', { name: 'Summarise this email' }).click()
  await expect(brain.getByText(/I treated them as text and I don't carry them out/)).toBeVisible()

  // si chiude e si riapre, e la conversazione è ancora lì
  await page.getByRole('button', { name: 'Hide Agentonic' }).click()
  await expect(brain).toHaveCount(0)
  await page.getByRole('button', { name: 'Ask Agentonic' }).click()
  await expect(brain.getByText(/I treated them as text and I don't carry them out/)).toBeVisible()
})

test('posta: ognuno vede solo la propria casella', async ({ page }) => {
  await entraCome(page, 'p-04', '/mail')
  await expect(page.getByRole('button', { name: /First part of the tag list/ })).toBeVisible()
  await expect(page.getByText('Updated inverter quote')).toHaveCount(0)
})

test('si entra cercando il proprio nome e premendo Invio', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.removeItem('company-brain-persona'))
  await page.goto('/')
  const cerca = page.getByRole('combobox', { name: 'Find yourself' })
  await expect(cerca).toBeFocused()
  await cerca.fill('ferr')
  await expect(page.getByRole('option', { name: /Giulia Ferraris/ })).toHaveAttribute('aria-selected', 'true')
  await cerca.press('Enter')
  await expect(page.getByRole('heading', { name: /Giulia$/ })).toBeVisible()
})

test('una trascrizione simulata nel formato ElevenLabs mostra orari e da dove arriverà', async ({ page }) => {
  const api = await request.newContext({ baseURL: BACKEND_URL, extraHTTPHeaders: { 'X-Persona': 'p-01' } })
  const r = await api.post('/riunioni?progetto_id=prj-01', {
    multipart: { file: { name: 'riu-006.json', mimeType: 'application/json', buffer: readFileSync('../dati/audio/riu-006.json') } },
  })
  expect(r.ok(), await r.text()).toBeTruthy()
  await api.dispose()
  await entraCome(page, 'p-01', '/documents/riu-006')
  await expect(page.getByText('ElevenLabs Speech-to-Text · simulated in the demo')).toBeVisible()
  await expect(page.getByText('speaker_3', { exact: true })).toBeVisible()   // il tecnico del cliente, senza nome
})
