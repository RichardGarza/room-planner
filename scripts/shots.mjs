// Walk through the running app in headless Chromium and save screenshots.
// Usage: node scripts/shots.mjs [baseUrl] [outDir]
// Env: WALK=1 to also capture walk mode and evening lighting; NARROW=1 to end with a 1100 px wide window.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:5179'
const out = process.argv[3] ?? 'shots'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()) })

const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('saved', `${out}/${name}.png`) }
const step = async (label, fn) => { try { await fn() } catch (e) { console.log(`step "${label}" failed:`, e.message.split('\n')[0]) } }

await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
// first launch asks for a name; answer it so the rest of the walkthrough is not blocked
await step('owner prompt', async () => {
  const q = page.locator('.owner-card input')
  if (await q.count()) { await q.fill(process.env.OWNER ?? 'Richard'); await page.locator('.owner-card button[type=submit]').click(); await page.waitForTimeout(400) }
})
await shot('01-library')

await step('new room panel', async () => {
  await page.getByRole('button', { name: /Start a new room/ }).click({ timeout: 15000 })
  await page.waitForTimeout(400)
})
await shot('01b-new-room')
await step('close new room panel', async () => {
  await page.getByRole('button', { name: 'Cancel' }).click({ timeout: 15000 })
  await page.waitForTimeout(300)
})

await step('open first room', async () => {
  const card = page.locator('.lib-card').first()
  await card.click({ timeout: 15000 })
})
await page.waitForTimeout(2500)
await shot('02-planner')

await step('select bed on the plan', async () => {
  const bed = page.locator('svg.plan g.plan-item').filter({ hasText: /bed/i }).first()
  await bed.click({ timeout: 15000 })
})
await page.waitForTimeout(600)
await shot('03-selected')

await step('door side view', async () => { await page.getByRole('button', { name: 'Door side' }).click({ timeout: 15000 }) })
await page.waitForTimeout(1500)
await shot('04-door-side')

await step('focus 2D', async () => { await page.getByRole('button', { name: 'Focus 2D' }).click({ timeout: 15000 }) })
await page.waitForTimeout(900)
await shot('08-focus-2d')
await step('focus 3D', async () => { await page.getByRole('button', { name: 'Focus 3D' }).click({ timeout: 15000 }) })
await page.waitForTimeout(600)

if (process.env.WALK) {
  await step('walk', async () => { await page.getByRole('button', { name: /Walk through/ }).click({ timeout: 15000 }) })
  await page.waitForTimeout(1500)
  await shot('05-walk')
  await step('evening', async () => { await page.getByRole('button', { name: /Evening/ }).click({ timeout: 15000 }) })
  await page.waitForTimeout(1500)
  await shot('06-evening')
  await step('outside again', async () => {
    await page.getByRole('button', { name: /View from outside/ }).click({ timeout: 15000 })
    await page.getByRole('button', { name: /Day$/ }).click({ timeout: 15000 })
  })
}

await step('open room card', async () => {
  await page.getByRole('button', { name: /^Room(?! bush)/ }).first().click({ timeout: 15000 })
  await page.locator('.sidebar').evaluate((el) => el.scrollTo(0, 99999))
})
await page.waitForTimeout(600)
await shot('07-room-card')

if (process.env.NARROW) {
  await step('narrow window', async () => { await page.setViewportSize({ width: 1100, height: 760 }) })
  await page.waitForTimeout(900)
  await shot('09-narrow')
}

await browser.close()
