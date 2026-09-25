// Walk through the running app in headless Chromium and save screenshots.
// Usage: node scripts/shots.mjs [baseUrl] [outDir]
// Env: WALK=1 to also capture walk mode and evening lighting.
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
await shot('01-library')

await step('open first room', async () => {
  const card = page.locator('[class*="card"]').filter({ hasText: /cm/ }).first()
  await card.click({ timeout: 4000 })
})
await page.waitForTimeout(2500)
await shot('02-planner')

await step('select bed on the plan', async () => {
  const bed = page.locator('svg.plan g.plan-item').filter({ hasText: /bed/i }).first()
  await bed.click({ timeout: 3000 })
})
await page.waitForTimeout(600)
await shot('03-selected')

await step('door side view', async () => { await page.getByRole('button', { name: 'Door side' }).click({ timeout: 3000 }) })
await page.waitForTimeout(1500)
await shot('04-door-side')

if (process.env.WALK) {
  await step('walk', async () => { await page.getByRole('button', { name: /Walk through/ }).click({ timeout: 3000 }) })
  await page.waitForTimeout(1500)
  await shot('05-walk')
  await step('evening', async () => { await page.getByRole('button', { name: /Evening/ }).click({ timeout: 3000 }) })
  await page.waitForTimeout(1500)
  await shot('06-evening')
  await step('outside again', async () => {
    await page.getByRole('button', { name: /View from outside/ }).click({ timeout: 3000 })
    await page.getByRole('button', { name: /Day/ }).click({ timeout: 3000 })
  })
}

await step('open room card', async () => {
  await page.getByRole('button', { name: /^Room/ }).first().click({ timeout: 3000 })
  await page.locator('.sidebar').evaluate((el) => el.scrollTo(0, 99999))
})
await page.waitForTimeout(600)
await shot('07-room-card')

await browser.close()
