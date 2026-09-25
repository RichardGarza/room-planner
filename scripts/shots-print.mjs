// Open the example room, open the Print / PDF dialog and screenshot it for both
// products and both papers, then trigger "Save PDF" and check a real PDF downloads.
// Usage: node scripts/shots-print.mjs [baseUrl] [outDir]
import { mkdirSync, statSync } from 'node:fs'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:5186'
const out = process.argv[3] ?? 'shots-print'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()) })

const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('saved', `${out}/${name}.png`) }
const step = async (label, fn) => { try { await fn() } catch (e) { console.log(`step "${label}" failed:`, e.message.split('\n')[0]) } }

await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

await step('open first room', async () => {
  const card = page.locator('[class*="card"]').filter({ hasText: /cm|in|items/ }).first()
  await card.click({ timeout: 15000 })
})
await page.waitForTimeout(2500)

await step('open print dialog', async () => { await page.getByRole('button', { name: /Print \/ PDF/ }).click({ timeout: 15000 }) })
await page.waitForTimeout(800)
await shot('10-print-plan-letter')

await step('plan on A4', async () => { await page.getByRole('radio', { name: 'A4' }).click({ timeout: 15000 }) })
await page.waitForTimeout(500)
await shot('11-print-plan-a4')

await step('legend page', async () => { await page.getByRole('button', { name: 'Next page' }).click({ timeout: 15000 }) })
await page.waitForTimeout(400)
await shot('12-print-plan-page2')

await step('kit on A4', async () => { await page.getByRole('radio', { name: /Cut-out kit/ }).click({ timeout: 15000 }) })
await page.waitForTimeout(500)
await shot('13-print-kit-a4')

await step('kit on Letter', async () => { await page.getByRole('radio', { name: 'Letter' }).click({ timeout: 15000 }) })
await page.waitForTimeout(500)
await shot('14-print-kit-letter')

await step('kit room page', async () => {
  const next = page.getByRole('button', { name: 'Next page' })
  for (let i = 0; i < 4; i++) {
    if (await next.isDisabled()) break
    await next.click({ timeout: 15000 })
  }
})
await page.waitForTimeout(400)
await shot('15-print-kit-room')

await step('kit landscape', async () => { await page.getByRole('radio', { name: 'Landscape' }).click({ timeout: 15000 }) })
await page.waitForTimeout(500)
await shot('16-print-kit-landscape')

await step('save pdf (kit)', async () => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.getByRole('button', { name: 'Save PDF' }).click({ timeout: 15000 }),
  ])
  const path = `${out}/${download.suggestedFilename()}`
  await download.saveAs(path)
  const size = statSync(path).size
  console.log('download', download.suggestedFilename(), size, 'bytes', size > 20 * 1024 ? 'OK (> 20 kB)' : 'TOO SMALL')
})
await page.waitForTimeout(600)
await shot('17-print-saved')

await step('save pdf (plan)', async () => {
  await page.getByRole('radio', { name: /Measured plan/ }).click({ timeout: 15000 })
  await page.getByRole('radio', { name: 'Auto' }).click({ timeout: 15000 })
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.getByRole('button', { name: 'Save PDF' }).click({ timeout: 15000 }),
  ])
  const path = `${out}/${download.suggestedFilename()}`
  await download.saveAs(path)
  const size = statSync(path).size
  console.log('download', download.suggestedFilename(), size, 'bytes', size > 20 * 1024 ? 'OK (> 20 kB)' : 'TOO SMALL')
})

await step('print (browser): mount the print root and render it with print media', async () => {
  // headless Chromium fires afterprint at once (which unmounts the print root); stub print() to keep it visible
  await page.evaluate(() => { window.print = () => {} })
  await page.getByRole('button', { name: 'Print', exact: true }).click({ timeout: 15000 })
  await page.waitForTimeout(500)
  const pages = await page.locator('#print-root .print-page').count()
  console.log('print root pages:', pages)
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(300)
  await shot('19-print-media')
  await page.emulateMedia({ media: 'screen' })
})

await step('close with Esc', async () => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const stillOpen = await page.getByRole('dialog').count()
  console.log('dialog closed with Esc:', stillOpen === 0)
})
await step('open with Cmd+P', async () => {
  await page.keyboard.press('Meta+p')
  await page.waitForTimeout(400)
  console.log('dialog opened with Cmd+P:', (await page.getByRole('dialog').count()) === 1)
})
await shot('18-print-cmd-p')

await browser.close()
