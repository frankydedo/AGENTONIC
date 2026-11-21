// Il percorso della demo, dall'interfaccia: i controlli del brief che si vedono a schermo.
// Gira contro lo stub del backend (backend/esempi.py): quando arriva il db vero, i testi
// dei dati vanno riallineati.
import { expect, test, type Page } from '@playwright/test'

// Ogni test fallisce se compare un errore JavaScript o una risposta 5xx del backend.
// I 403/405 sono attesi (permessi negati, endpoint non ancora nel backend) e non contano.
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
  await expect(page.getByText(/«Marco» è ambiguo/).first()).toBeVisible()
})

test('controlli 2 e 6: il manager corregge un punto oscuro e approva', async ({ page }) => {
  await entraCome(page, 'p-01', '/documenti/riu-001')
  // la scheda si trova dalla sua fonte (s009): in correzione il titolo sta in un campo di testo
  const carta = page.locator('li').filter({ has: page.getByText('Nuovo task') }).filter({ has: page.getByRole('link', { name: /s009/ }) })
  await expect(carta.getByText('Nessun responsabile')).toBeVisible()

  await carta.getByRole('button', { name: 'Correggi' }).click()
  await carta.getByLabel('Chi se ne occupa').selectOption('p-02')
  await carta.getByRole('button', { name: 'Approva con le correzioni' }).click()

  await expect(page.getByText('Corretta e approvata')).toBeVisible()
  await expect(carta.getByText('Approvata', { exact: true })).toBeVisible()
  await expect(carta.getByText('Marco Bianchi')).toBeVisible()
  await expect(carta.getByText('Approvata da Giulia Ferraris')).toBeVisible()
  // il punto oscuro collegato si chiude da solo
  await expect(page.getByText(/«Marco» è ambiguo/)).toHaveCount(0)
})

test('controllo 6: una proposta rifiutata resta fuori dalla memoria', async ({ page }) => {
  await entraCome(page, 'p-01', '/documenti/riu-001')
  const carta = page.locator('li', { hasText: 'progetto · budget' })
  await carta.getByRole('button', { name: 'Rifiuta' }).click()
  await expect(carta.getByText('Rifiutata', { exact: true })).toBeVisible()
  await expect(carta.getByRole('button', { name: 'Approva' })).toHaveCount(0)
})

test('controllo 4: la citazione apre la fonte con la frase evidenziata', async ({ page }) => {
  await entraCome(page, 'p-01')
  await page.getByRole('link', { name: /s009/ }).first().click()
  await expect(page).toHaveURL(/\/documenti\/riu-001\?seg=s009$/)
  const fonte = page.locator('li', { has: page.getByText('Fonte selezionata') })
  await expect(fonte).toContainText('la lista dei tag la prepari tu entro il 25 novembre')
  await expect(fonte).toBeInViewport()
})

test('controlli 3 e 4: chi ha la competenza budget riceve la risposta con la fonte', async ({ page }) => {
  await entraCome(page, 'p-02', '/chiedi')
  await chiedi(page, 'Quanto budget resta?')
  await expect(page.getByText('Restano 35.500 € di budget')).toBeVisible()
  await page.getByRole('link', { name: /s003/ }).click()
  await expect(page).toHaveURL(/seg=s003$/)
  await expect(page.locator('li', { has: page.getByText('Fonte selezionata') })).toContainText('48.000 euro')
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
  await expect(page.getByText(/«Marco» è ambiguo/)).toHaveCount(0)
  await page.goto('/registro')
  await expect(page.getByText('Solo per il manager')).toBeVisible()
})

test('chi è fuori dal progetto non vede nulla', async ({ page }) => {
  await entraCome(page, 'p-08')
  await expect(page.getByText('non fai parte di questo progetto')).toBeVisible()
  await expect(page.getByText('Revamping linea')).toHaveCount(0)
})

test('controllo 7: Gantt e to-do per persona', async ({ page }) => {
  await entraCome(page, 'p-01', '/team')
  await expect(page.getByRole('button', { name: 'Schermate della nuova HMI' }).last()).toBeVisible()
  await expect(page.getByText('Collaudo').first()).toBeVisible()
  await page.getByRole('button', { name: 'Per persona' }).click()
  const sara = page.locator('section', { hasText: 'Sara Colombo' }).first()
  await expect(sara.getByText('Aspetta: Preparare la lista dei tag del PLC').first()).toBeVisible()
})

test('regressione: dopo molti ricaricamenti il backend risponde ancora', async ({ page }) => {
  // prima della correzione ogni ricaricamento lasciava appesa la connessione SSE e dopo 6
  // Chrome bloccava tutte le chiamate (la chat restava in attesa)
  await entraCome(page, 'p-02')
  for (let i = 0; i < 8; i++) await page.reload()
  await page.getByRole('link', { name: 'Chiedi al Brain' }).first().click()
  await chiedi(page, 'Quanto budget resta?')
  await expect(page.getByText('Restano 35.500 € di budget')).toBeVisible()
})
