import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { useLibrary } from '../library'
import { buildSheets, type Orientation, type Paper, type Product, type Sheet } from '../print'
import { pdfFileName, sheetsToPdf } from '../print/pdf'
import { getStorage, isTauri } from '../storage'
import { useStore } from '../store'
import { useUnits } from '../units'
import './print.css'

/** Open/closed state lives in a tiny store so the keyboard shortcut in App.tsx can open the dialog. */
export const usePrintDialog = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

export function PrintDialog() {
  const open = usePrintDialog((s) => s.open)
  if (!open) return null
  return <PrintDialogBody />
}

const PRODUCTS: { id: Product; label: string; hint: string }[] = [
  { id: 'plan', label: 'Measured plan', hint: 'The room with every piece, its distances to the walls and a furniture list. Take it into the room with a tape measure.' },
  { id: 'kit', label: 'Cut-out kit', hint: 'Every piece of furniture at scale to cut out, plus the empty room at the same scale on the last page.' },
]
const PAPERS: { id: Paper; label: string }[] = [
  { id: 'letter', label: 'Letter' },
  { id: 'a4', label: 'A4' },
]
const ORIENTATIONS: { id: Orientation; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'landscape', label: 'Landscape' },
  { id: 'portrait', label: 'Portrait' },
]

function PrintDialogBody() {
  const setOpen = usePrintDialog((s) => s.setOpen)
  const close = () => setOpen(false)
  const room = useStore((s) => s.room)
  const items = useStore((s) => s.items)
  const unit = useUnits((s) => s.unit)
  const group = useLibrary((s) => s.rooms.find((r) => r.id === s.currentId)?.group)

  const [product, setProduct] = useState<Product>('plan')
  const [paper, setPaper] = useState<Paper>(unit === 'in' ? 'letter' : 'a4')
  const [orientation, setOrientation] = useState<Orientation>('auto')
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState<'pdf' | 'print' | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad' | 'info'; text: string } | null>(null)

  const sheets = useMemo(
    () => buildSheets(product, { room, items, unit, group }, { paper, orientation }),
    [product, room, items, unit, group, paper, orientation],
  )
  const current = sheets[Math.min(page, sheets.length - 1)]
  const notes = sheets.flatMap((s) => s.notes ?? [])

  useEffect(() => { setPage(0) }, [product, paper, orientation])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [setOpen])

  const savePdf = async () => {
    setBusy('pdf')
    setMessage(null)
    try {
      const data = await sheetsToPdf(sheets, `${room.name} - ${product === 'kit' ? 'cut-out kit' : 'floor plan'}`)
      const storage = await getStorage()
      if (!storage.saveFile) throw new Error('Saving files is not available here')
      await storage.saveFile(pdfFileName(room.name, product), data, 'application/pdf')
      setMessage({ kind: 'ok', text: `PDF ready: ${sheets.length} page${sheets.length === 1 ? '' : 's'}.` })
      return true
    } catch (err) {
      setMessage({ kind: 'bad', text: err instanceof Error ? err.message : String(err) })
      return false
    } finally {
      setBusy(null)
    }
  }

  const print = async () => {
    setBusy('print')
    setMessage(null)
    try {
      if (isTauri()) {
        const printed = await printInTauri(sheets)
        if (!printed) {
          setMessage({ kind: 'info', text: 'The Mac app cannot open the print dialog yet, so the PDF was saved instead. Open it in Preview and print from there.' })
          await savePdf()
          return
        }
      } else {
        printInBrowser(sheets)
      }
    } catch (err) {
      setMessage({ kind: 'bad', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="print-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) close() }} role="presentation">
      <div className="print-dialog" role="dialog" aria-modal="true" aria-label="Print or save as PDF">
        <div className="print-side">
          <div className="print-head">
            <h3>Print / PDF</h3>
            <button className="icon" onClick={close} aria-label="Close" title="Close (Esc)">✕</button>
          </div>

          <div className="print-opt">
            <h4>What</h4>
            <div className="print-choices" role="radiogroup" aria-label="What to print">
              {PRODUCTS.map((p) => (
                <button key={p.id} role="radio" aria-checked={product === p.id} className={`print-choice${product === p.id ? ' on' : ''}`} onClick={() => setProduct(p.id)}>
                  <strong>{p.label}</strong>
                  <span>{p.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="print-opt">
            <h4>Paper</h4>
            <div className="print-seg" role="radiogroup" aria-label="Paper">
              {PAPERS.map((p) => (
                <button key={p.id} role="radio" aria-checked={paper === p.id} className={paper === p.id ? 'on' : ''} onClick={() => setPaper(p.id)}>{p.label}</button>
              ))}
            </div>
          </div>

          <div className="print-opt">
            <h4>Orientation</h4>
            <div className="print-seg" role="radiogroup" aria-label="Orientation">
              {ORIENTATIONS.map((o) => (
                <button key={o.id} role="radio" aria-checked={orientation === o.id} className={orientation === o.id ? 'on' : ''} onClick={() => setOrientation(o.id)}>{o.label}</button>
              ))}
            </div>
          </div>

          <p className="print-note">
            {sheets.length} page{sheets.length === 1 ? '' : 's'} · {unit === 'in' ? 'inches' : 'centimetres'} · print at 100% and check the bar in the footer.
          </p>
          {notes.map((n) => <p key={n} className="print-note warn">{n}</p>)}
          {message && <p className={`print-note ${message.kind}`} role="status">{message.text}</p>}

          <div className="print-actions">
            <button className="chip solid" onClick={() => void savePdf()} disabled={busy !== null}>{busy === 'pdf' ? 'Saving…' : 'Save PDF'}</button>
            <button className="chip" onClick={() => void print()} disabled={busy !== null}>{busy === 'print' ? 'Printing…' : 'Print'}</button>
          </div>
        </div>

        <div className="print-main">
          <div className="print-preview" aria-label={`Page ${page + 1} preview`} dangerouslySetInnerHTML={{ __html: current.svg }} />
          <div className="print-pager">
            <button className="chip ghost" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page">‹</button>
            <span>Page {Math.min(page, sheets.length - 1) + 1} of {sheets.length}</span>
            <button className="chip ghost" onClick={() => setPage((p) => Math.min(sheets.length - 1, p + 1))} disabled={page >= sheets.length - 1} aria-label="Next page">›</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- printing ---------- */

const PRINT_ROOT_ID = 'print-root'

/** Put the sheets in a print-only root (print.css hides everything else and sizes the pages). */
function mountPrintRoot(sheets: Sheet[]): () => void {
  document.getElementById(PRINT_ROOT_ID)?.remove()
  const root = document.createElement('div')
  root.id = PRINT_ROOT_ID
  const first = sheets[0]
  const style = document.createElement('style')
  style.textContent = `@page { size: ${first.w}mm ${first.h}mm; margin: 0; }`
  root.appendChild(style)
  for (const sheet of sheets) {
    const pageEl = document.createElement('div')
    pageEl.className = 'print-page'
    pageEl.style.width = `${sheet.w}mm`
    pageEl.style.height = `${sheet.h}mm`
    pageEl.innerHTML = sheet.svg
    root.appendChild(pageEl)
  }
  document.body.appendChild(root)
  return () => root.remove()
}

function printInBrowser(sheets: Sheet[]) {
  const unmount = mountPrintRoot(sheets)
  window.addEventListener('afterprint', unmount, { once: true })
  window.print()
}

/** Tauri's webview window has no print API in every version; report false when it is missing. */
async function printInTauri(sheets: Sheet[]): Promise<boolean> {
  let printFn: (() => Promise<void> | void) | undefined
  let win: unknown
  try {
    const mod = await import('@tauri-apps/api/webviewWindow')
    win = mod.getCurrentWebviewWindow()
    const candidate = (win as { print?: unknown }).print
    if (typeof candidate === 'function') printFn = candidate as () => Promise<void> | void
  } catch {
    return false
  }
  if (!printFn) return false
  const unmount = mountPrintRoot(sheets)
  window.addEventListener('afterprint', unmount, { once: true })
  try {
    await printFn.call(win)
    return true
  } catch {
    unmount()
    return false
  }
}
