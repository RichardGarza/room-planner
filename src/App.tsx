import { useEffect } from 'react'
import { FloorPlan } from './components/FloorPlan'
import { Library } from './components/Library'
import { Scene3D } from './components/Scene3D'
import { Sidebar } from './components/Sidebar'
import { SplitPane, useSplit } from './components/SplitPane'
import { TopBar } from './components/TopBar'
import { useLibrary } from './library'
import { useStore, type OutsideAngle } from './store'
import './components/focus.css'

const ANGLES: { id: OutsideAngle; label: string }[] = [
  { id: 'corner', label: 'Corner' },
  { id: 'above', label: 'Above' },
  { id: 'window', label: 'Window side' },
  { id: 'door', label: 'Door side' },
]

export default function App() {
  const currentId = useLibrary((s) => s.currentId)
  const start = useLibrary((s) => s.start)

  // load the room list (and a shared link, if the URL has one) once
  useEffect(() => { void start() }, [start])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!useLibrary.getState().currentId) return
      const tag = (e.target as HTMLElement).tagName
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void useLibrary.getState().saveNow()
        return
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const st = useStore.getState()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo(); else st.undo()
        return
      }
      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        useSplit.getState().toggleFocus()
        return
      }
      if (e.key === 'Escape') st.select(null)
      if (!st.selectedId) return
      if (e.key === 'r' || e.key === 'R') st.rotateItem(st.selectedId, e.shiftKey ? -90 : 90)
      if (e.key === 'Delete' || e.key === 'Backspace') st.toggleInRoom(st.selectedId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!currentId) return <Library />
  return <Planner />
}

function Planner() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const outsideAngle = useStore((s) => s.outsideAngle)
  const setOutsideAngle = useStore((s) => s.setOutsideAngle)
  const walkTo = useStore((s) => s.walkTo)
  const daytime = useStore((s) => s.daytime)
  const setSetting = useStore((s) => s.setSetting)
  const selectedId = useStore((s) => s.selectedId)
  const selected = useStore((s) => s.items.find((i) => i.id === s.selectedId))
  const rotateItem = useStore((s) => s.rotateItem)
  const toggleInRoom = useStore((s) => s.toggleInRoom)
  const focus = useSplit((s) => s.focus)
  const setFocus = useSplit((s) => s.setFocus)

  const plan = (
    <>
      <div className="pane-head">
        <div>
          <h4>Floor plan</h4>
          <span className="legend">drag items · R rotates · drop below the room to remove</span>
        </div>
        <div className="focus-seg" role="group" aria-label="Focus">
          <span className="focus-label">Focus</span>
          <button className={focus === '2d' ? 'on' : ''} aria-label="Focus 2D" aria-pressed={focus === '2d'} title="Bigger floor plan (F)" onClick={() => setFocus('2d')}>2D</button>
          <button className={focus === '3d' ? 'on' : ''} aria-label="Focus 3D" aria-pressed={focus === '3d'} title="Bigger 3D view (F)" onClick={() => setFocus('3d')}>3D</button>
        </div>
      </div>
      <FloorPlan />
      {selected && (
        <div className="item-toolbar">
          <span>{selected.name.split(' ').slice(0, 2).join(' ')}</span>
          <button onClick={() => rotateItem(selected.id, -90)} title="Rotate left">↺</button>
          <button onClick={() => rotateItem(selected.id, 90)} title="Rotate right">↻</button>
          <button onClick={() => toggleInRoom(selected.id)} title={selected.inRoom ? 'Take out' : 'Put back'}>{selected.inRoom ? '→' : '←'}</button>
        </div>
      )}
    </>
  )

  const scene = (
    <>
      <div className="scene-controls">
        <div className="seg">
          <button className={view === 'outside' ? 'on' : ''} onClick={() => setView('outside')}>View from outside</button>
          <button className={view === 'walk' ? 'on' : ''} onClick={() => walkTo('door')}>Walk through the room</button>
        </div>
        <div className="seg sub">
          {view === 'outside' ? (
            ANGLES.map((a) => (
              <button key={a.id} className={outsideAngle === a.id ? 'on' : ''} onClick={() => setOutsideAngle(a.id)}>{a.label}</button>
            ))
          ) : (
            <>
              <button onClick={() => walkTo('door')}>From the door</button>
              <button onClick={() => walkTo('window')}>From the window</button>
            </>
          )}
        </div>
      </div>
      <div className="seg daynight">
        <button className={daytime ? 'on' : ''} onClick={() => setSetting('daytime', true)}>☀ Day</button>
        <button className={!daytime ? 'on' : ''} onClick={() => setSetting('daytime', false)}>☾ Evening</button>
      </div>
      {view === 'walk' && <div className="walk-hint">Drag to look around · W A S D or arrows to move</div>}
      {view === 'outside' && !selectedId && <div className="walk-hint">Drag to orbit · scroll to zoom · click furniture to select, drag to move</div>}
      <Scene3D />
    </>
  )

  return (
    <div className="app">
      <TopBar />
      <main className="main">
        <SplitPane leftClassName="pane plan-pane" rightClassName="pane scene-pane" left={plan} right={scene} />
        <Sidebar />
      </main>
    </div>
  )
}
