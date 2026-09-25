import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import { isRugKind, rectOf } from '../geometry'
import { useStore, type OutsideAngle } from '../store'
import type { Item, Room } from '../types'
import { cm } from './util'

/* --------------------------------- cameras -------------------------------- */

export const anglePositions = (room: Room): Record<OutsideAngle, [number, number, number]> => {
  const W = cm(room.w), D = cm(room.d)
  return {
    corner: [-1.9, 3.6, D + 2.2],
    above: [W / 2, 6.2, D / 2 + 0.01],
    window: [W / 2, 2.6, -3.2],
    door: [W / 2, 2.4, D + 3.4],
  }
}

export function OutsideCamera({ room, locked }: { room: Room; locked: boolean }) {
  const angle = useStore((s) => s.outsideAngle)
  const camera = useThree((s) => s.camera)
  const controls = useRef<any>(null)
  const target = useMemo(() => new THREE.Vector3(cm(room.w) / 2, 0.8, cm(room.d) / 2), [room])
  useEffect(() => {
    const p = anglePositions(room)[angle]
    camera.position.set(...p)
    camera.lookAt(target)
    controls.current?.target.copy(target)
    controls.current?.update()
  }, [angle, room, camera, target])
  return <OrbitControls ref={controls} makeDefault enabled={!locked} target={target} maxPolarAngle={Math.PI / 2 - 0.05} minDistance={1.5} maxDistance={14} enableDamping dampingFactor={0.12} />
}

export function WalkControls({ room, items }: { room: Room; items: Item[] }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const keys = useRef<Set<string>>(new Set())
  const walkHeight = useStore((s) => s.walkHeight)

  useEffect(() => {
    const el = gl.domElement
    let last: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => { last = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId) }
    const move = (e: PointerEvent) => {
      if (!last) return
      const dx = e.clientX - last.x, dy = e.clientY - last.y
      last = { x: e.clientX, y: e.clientY }
      const p = useStore.getState().walkPose
      useStore.getState().setWalkPose({ yaw: p.yaw - dx * 0.004, pitch: THREE.MathUtils.clamp(p.pitch - dy * 0.004, -1.2, 1.2) })
    }
    const up = () => { last = null }
    const kd = (e: KeyboardEvent) => { if ((e.target as HTMLElement).tagName !== 'INPUT') keys.current.add(e.key.toLowerCase()) }
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [gl])

  useFrame((_, dt) => {
    const st = useStore.getState()
    const p = st.walkPose
    const k = keys.current
    const speed = 130 * Math.min(dt, 0.05) // cm per second
    let fwd = 0, side = 0
    if (k.has('w') || k.has('arrowup')) fwd += 1
    if (k.has('s') || k.has('arrowdown')) fwd -= 1
    if (k.has('d') || k.has('arrowright')) side += 1
    if (k.has('a') || k.has('arrowleft')) side -= 1
    let x = p.x, y = p.y
    if (fwd || side) {
      // camera looks along (-sin yaw, -cos yaw) in plan (x, y=z)
      const fx = -Math.sin(p.yaw), fy = -Math.cos(p.yaw)
      const rx = Math.cos(p.yaw), ry = -Math.sin(p.yaw)
      const nx = x + (fx * fwd + rx * side) * speed
      const ny = y + (fy * fwd + ry * side) * speed
      const blocked = (px: number, py: number) => {
        if (px < 20 || px > room.w - 20 || py < 20 || py > room.d - 20) return true
        return items.some((it) => {
          if (!it.inRoom || isRugKind(it.kind)) return false
          const r = rectOf(it)
          return px > r.x0 - 12 && px < r.x1 + 12 && py > r.y0 - 12 && py < r.y1 + 12
        })
      }
      if (!blocked(nx, y)) x = nx
      if (!blocked(x, ny)) y = ny
      if (x !== p.x || y !== p.y) st.setWalkPose({ x, y })
    }
    const eye = walkHeight === 'adult' ? 1.62 : 1.08
    camera.position.set(cm(x), eye, cm(y))
    camera.rotation.order = 'YXZ'
    camera.rotation.set(p.pitch, p.yaw, 0)
  })
  return null
}
