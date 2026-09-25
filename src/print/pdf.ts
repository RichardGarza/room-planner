import { jsPDF } from 'jspdf'
import 'svg2pdf.js'
import type { Sheet } from './types'

/**
 * Turn the SVG sheets into one PDF (one page per sheet, each at its own page
 * size) with jsPDF + svg2pdf.js. Runs in the browser only: svg2pdf needs a DOM
 * to measure the SVG, so each sheet is parsed and attached off-screen while it renders.
 */
export async function sheetsToPdf(sheets: Sheet[], title = 'Room Planner'): Promise<Uint8Array> {
  if (sheets.length === 0) throw new Error('Nothing to print')
  const first = sheets[0]
  // uncompressed: the sheets are small vector drawings, and plain streams keep the text searchable in every viewer
  const doc = new jsPDF({ unit: 'mm', format: [first.w, first.h], orientation: first.w >= first.h ? 'landscape' : 'portrait', compress: false })
  doc.setProperties({ title, creator: 'Room Planner' })

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;visibility:hidden'
  document.body.appendChild(host)
  try {
    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i]
      if (i > 0) doc.addPage([sheet.w, sheet.h], sheet.w >= sheet.h ? 'landscape' : 'portrait')
      host.innerHTML = sheet.svg
      const el = host.querySelector('svg')
      if (!el) throw new Error('Could not build the page')
      await doc.svg(el, { x: 0, y: 0, width: sheet.w, height: sheet.h })
    }
  } finally {
    host.remove()
  }
  return new Uint8Array(doc.output('arraybuffer'))
}

/** "milas-room-floor-plan.pdf" */
export function pdfFileName(roomName: string, product: 'plan' | 'kit'): string {
  const slug = roomName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'room'
  return `${slug}-${product === 'kit' ? 'cut-out-kit' : 'floor-plan'}.pdf`
}
