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
  await page.getByPlaceholder('Fai una domanda sul progetto…').fill(domanda)
  await page.getByRole('button', { name: 'Chiedi', exact: true }).click()
}

const fonte = (page: Page) => page.locator('li', { has: page.getByText('Fonte selezionata') })

test('si entra scegliendo chi si è', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Chi sei?')).toBeVisible()
  await page.getByRole('button', { name: /Giulia Ferraris/ }).click()
  await expect(page.getByRole('heading', { name: /Giulia$/ })).toBeVisible()
  await expect(page.getByText('Proposte da decidere')).toBeVisible()
})

test('controllo 1: il Brain parla per primo, senza che nessuno chieda', async ({ page }) => {
  await entraCome(page, 'p-01')
  await expect(page.getByText('In ascolto: gli avvisi arrivano da soli')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Segna come risolto' }).first()).toBeVisible()
})

test('controlli 2 e 6: il manager corregge una proposta e la approva', async ({ page }) => {
  await entraCome(page, 'p-01', '/documenti/riu-002')
  // la scheda si trova dalla sua fonte (s006): in correzione il titolo sta in un campo di testo
  const conFonte = (p: Page) => p.locator('li').filter({ has: p.getByText('Nuovo task') }).filter({ has: p.getByRole('link', { name: /s006/ }) })
  const carta = conFonte(page)
  await carta.getByRole('button', { name: 'Correggi' }).click()
  await carta.getByLabel('Chi se ne occupa').selectOption('p-05')
  // aree: menu a tendina con ricerca
  await carta.getByRole('button', { name: 'Visibile a' }).click()
  // il menu sta in un portale sopra tutta la pagina, non dentro la scheda
  await page.getByPlaceholder("Cerca un'area…").fill('comm')
  await page.getByRole('menuitemcheckbox', { name: /commerciale/ }).click()
  await page.keyboard.press('Escape')
  await carta.getByRole('button', { name: 'Approva con le correzioni' }).click()
  await expect(page.getByText('Corretta e approvata')).toBeVisible()

  // la proposta decisa passa nel cassetto «Approvate»
  await page.getByRole('button', { name: /^Approvate/ }).click()
  const approvata = conFonte(page)
  await expect(approvata.getByText('Approvata', { exact: true })).toBeVisible()
  await expect(approvata.getByText('Luca Gallo')).toBeVisible()
  await expect(approvata.getByText('commerciale')).toBeVisible()
  await expect(approvata.getByText('Approvata da Giulia Ferraris')).toBeVisible()
})

test('controllo 6: una proposta rifiutata resta fuori dalla memoria, e si può recuperare', async ({ page }) => {
  await entraCome(page, 'p-01', '/documenti/riu-002')
  const carta = () => page.locator('li').filter({ has: page.getByText('Nuovo fatto') }).filter({ hasText: 'riutilizzabili' })
  await carta().getByRole('button', { name: 'Rifiuta' }).click()
  await page.getByRole('button', { name: /^Rifiutate/ }).click()
  await expect(carta().getByText('Rifiutata', { exact: true })).toBeVisible()
  await expect(carta().getByRole('button', { name: 'Approva' })).toHaveCount(0)
  // recuperarla: finché il backend non ha POST /proposte/{id}/riapri, errore chiaro
  await carta().getByRole('button', { name: 'Recupera' }).click()
  await expect(page.getByText(/non permette ancora di recuperare le proposte rifiutate/)).toBeVisible()
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
  await expect(page.getByText('Nessuna fonte che puoi vedere')).toBeVisible()
  await expect(page.getByText('35.500')).toHaveCount(0)
})

test('un membro non vede proposte, avvisi riservati e registro', async ({ page }) => {
  await entraCome(page, 'p-04')
  await expect(page.getByText('La tua giornata')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Registro' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Approva' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Segna come risolto' })).toHaveCount(0)
  await page.goto('/registro')
  await expect(page.getByText('Solo per il manager')).toBeVisible()
})

test('Paola vede solo il suo progetto (ISO 9001), non la linea 3', async ({ page }) => {
  await entraCome(page, 'p-08', '/progetti')
  await expect(page.getByText('Certificazione ISO 9001').first()).toBeVisible()
  await expect(page.getByText('Revamping linea di confezionamento 3')).toHaveCount(0)
})

test('controllo 7: Gantt e to-do per persona', async ({ page }) => {
  await entraCome(page, 'p-01', '/team')
  await expect(page.getByRole('button', { name: /schermate della nuova HMI/i }).last()).toBeVisible()
  await expect(page.getByText('Collaudo').first()).toBeVisible()
  await page.getByRole('button', { name: 'Per persona' }).click()
  const sara = page.locator('section', { hasText: 'Sara Colombo' }).first()
  await expect(sara.getByText(/schermate della nuova HMI/i).first()).toBeVisible()
})

test('regressione: dopo molti ricaricamenti il backend risponde ancora', async ({ page }) => {
  // prima della correzione ogni ricaricamento lasciava appesa la connessione SSE e dopo 6
  // Chrome bloccava tutte le chiamate (la chat restava in attesa)
  await entraCome(page, 'p-02')
  for (let i = 0; i < 8; i++) await page.reload()
  await page.getByRole('link', { name: 'Chiedi al Brain' }).first().click()
  await chiedi(page, 'Quanto budget resta?')
  await expect(page.getByText(/Restano 35\.500 €/)).toBeVisible()
})

test('il manager carica una riunione e vede il Brain lavorare passo per passo', async ({ page }) => {
  await entraCome(page, 'p-01')
  await page.getByRole('button', { name: 'Carica riunione' }).click()
  const finestra = page.getByRole('dialog', { name: 'Carica una riunione' })
  await finestra.locator('input[type=file]').setInputFiles('../dati/riunioni/riu-003.md')
  await expect(finestra.getByText('Analisi completata')).toBeVisible({ timeout: 20_000 })
  await expect(finestra.getByText('proposte da decidere')).toBeVisible()
  await expect(finestra.getByText(/^Il Brain /).first()).toBeVisible()
  await finestra.getByRole('button', { name: 'Rivedi le proposte' }).click()
  await expect(page).toHaveURL(/\/documenti\/riu-003$/)
})

test('il registro si legge in italiano, i dati grezzi solo nei dettagli tecnici', async ({ page }) => {
  await entraCome(page, 'p-01', '/registro')
  await expect(page.getByText(/Giulia Ferraris ha approvato la proposta/).first()).toBeVisible()
  await expect(page.getByText(/^Il Brain /).first()).toBeVisible()
  await expect(page.locator('pre').first()).toBeHidden()
  await page.getByText('Dettagli tecnici').first().click()
  await expect(page.locator('pre').first()).toBeVisible()
})

test('si sceglie il progetto tra quelli di cui si è membri', async ({ page }) => {
  await entraCome(page, 'p-01')
  await page.getByRole('button', { name: /Revamping linea di confezionamento 3/ }).first().click()
  await expect(page.getByText('Aperti di recente')).toBeVisible()
  // al massimo 3 progetti, più il link a tutti; il menu sta in un portale sopra la pagina
  const menu = page.locator('body > div').filter({ hasText: 'Aperti di recente' }).last()
  expect(await menu.getByRole('button').count()).toBeLessThanOrEqual(3)
  await expect(menu.getByRole('link', { name: /Tutti i progetti \(\d+\)/ })).toBeVisible()
  await menu.getByRole('link', { name: /Tutti i progetti/ }).click()
  await expect(page).toHaveURL(/\/progetti$/)
})

test('aspetto: si passa al tema scuro e la scelta resta dopo il ricaricamento', async ({ page }) => {
  await entraCome(page, 'p-01')
  await page.getByRole('button', { name: /Giulia Ferraris/ }).first().click()
  await page.getByRole('group', { name: 'Aspetto' }).getByRole('button', { name: 'Scuro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('il project manager vede i suoi progetti e il modulo per crearne uno', async ({ page }) => {
  await entraCome(page, 'p-01', '/progetti')
  const scheda = page.locator('li', { hasText: 'Revamping linea di confezionamento 3' }).first()
  await expect(scheda.getByText('Sei il manager')).toBeVisible()
  await expect(scheda.getByRole('button', { name: /Modifica/ })).toBeVisible()

  await page.getByRole('button', { name: 'Nuovo progetto' }).click()
  const modulo = page.getByRole('dialog', { name: 'Nuovo progetto' })
  await modulo.getByRole('button', { name: 'Crea il progetto' }).click()
  await expect(modulo.getByText('Dai un nome al progetto.')).toBeVisible()

  await modulo.getByPlaceholder('Es. Revamping linea 4').fill('Revamping linea 4')
  await modulo.getByPlaceholder('Es. Pastificio Valsangone S.p.A.').fill('Pastificio Valsangone S.p.A.')
  await modulo.locator('input[type=date]').fill('2027-03-31')
  await modulo.getByRole('button', { name: 'Crea il progetto' }).click()
  await expect(page.getByText('Progetto creato')).toBeVisible()

  // il nuovo progetto si apre; poi il suo manager lo elimina, con conferma
  await page.goto('/progetti')
  const nuova = page.locator('li', { hasText: 'Revamping linea 4' }).first()
  await expect(nuova.getByText('Sei il manager')).toBeVisible()
  await nuova.getByRole('button', { name: /Modifica/ }).click()
  await page.getByRole('button', { name: 'Elimina progetto' }).click()
  await page.getByRole('button', { name: 'Elimina davvero, con tutti i dati' }).click()
  await expect(page.getByText('Progetto eliminato')).toBeVisible()
  await expect(page.getByText('Revamping linea 4')).toHaveCount(0)
})

test('un membro vede solo i suoi progetti, senza crearne né modificarli', async ({ page }) => {
  await entraCome(page, 'p-04', '/progetti')
  const scheda = page.locator('li', { hasText: 'Revamping linea di confezionamento 3' }).first()
  await expect(scheda.getByText('Membro', { exact: true })).toBeVisible()
  await expect(scheda.getByText('Qui vedi:')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nuovo progetto' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Modifica/ })).toHaveCount(0)
})

test('impostazioni: si passa dal tema chiaro allo scuro', async ({ page }) => {
  await entraCome(page, 'p-04')
  await page.getByRole('link', { name: 'Impostazioni' }).first().click()
  await page.getByRole('group', { name: 'Aspetto' }).getByRole('button', { name: 'Scuro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('group', { name: 'Aspetto' }).getByRole('button', { name: 'Chiaro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('i cassetti delle proposte si aprono e si chiudono', async ({ page }) => {
  await entraCome(page, 'p-01', '/documenti/riu-002')
  const daDecidere = page.getByRole('button', { name: /^Da decidere/ })
  await expect(daDecidere).toHaveAttribute('aria-expanded', 'true')
  const unaProposta = page.locator('li').filter({ has: page.getByText('Aggiorna task') }).first()
  await expect(unaProposta).toBeVisible()
  await daDecidere.click()
  await expect(daDecidere).toHaveAttribute('aria-expanded', 'false')
  await expect(unaProposta).toBeHidden()
  await daDecidere.click()
  await expect(unaProposta).toBeVisible()
})

test('le persone si cercano: inoltro di un avviso', async ({ page }) => {
  await entraCome(page, 'p-01')
  await page.getByRole('button', { name: 'Inoltra' }).first().click()
  const finestra = page.getByRole('dialog', { name: "Inoltra l'avviso" })
  await finestra.getByPlaceholder(/Cerca tra \d+ persone/).fill('sara')
  await expect(finestra.getByRole('menuitemcheckbox')).toHaveCount(1)
  await finestra.getByRole('menuitemcheckbox', { name: /Sara Colombo/ }).click()
  await expect(finestra.getByRole('menuitemcheckbox', { name: /Sara Colombo/ })).toHaveAttribute('aria-checked', 'true')
})
