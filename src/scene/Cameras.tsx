import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import { isRugKind, rectOf } from '../geometry'
import { useStore, type OutsideAngle } from '../store'
import type { Item, Room, Wall } from '../types'
import { cm } from './util'

/* --------------------------------- cameras -------------------------------- */

/**
 * The corner preset stands at a corner facing the door wall, so the door is one of the two
 * visible walls (the two walls nearest the camera are hidden). Of the two corners that face the
 * door wall it prefers the one whose other visible wall has a window, then a closet, and
 * otherwise the corner diagonally opposite the door's own end of its wall.
 */
function cornerFor(room: Room): [number, number, number] {
  const W = cm(room.w), D = cm(room.d)
  const door = room.doors[0]
  const dx = 1.9, dz = 2.2, y = 3.6
  if (!door) return [-dx, y, D + dz]
  const has = (wall: Wall) => (room.windows.some((w) => w.wall === wall) ? 2 : 0) + ((room.closets ?? []).some((c) => c.wall === wall) ? 1 : 0)
  const mid = door.offset + door.width / 2
  if (door.wall === 'top' || door.wall === 'bottom') {
    const z = door.wall === 'top' ? D + dz : -dz
    const scoreLeft = has('right'), scoreRight = has('left') // a camera on the left sees the right wall
    const left = scoreLeft !== scoreRight ? scoreLeft > scoreRight : mid > room.w / 2
    return [left ? -dx : W + dx, y, z]
  }
  const x = door.wall === 'left' ? W + dx : -dx
  const scoreTop = has('bottom'), scoreBottom = has('top') // a camera at the top sees the bottom wall
  const top = scoreTop !== scoreBottom ? scoreTop > scoreBottom : mid > room.d / 2
  return [x, y, top ? -dz : D + dz]
}

export const anglePositions = (room: Room): Record<OutsideAngle, [number, number, number]> => {
  const W = cm(room.w), D = cm(room.d)
  return {
    corner: cornerFor(room),
    above: [W / 2, 6.2, D / 2 + 0.01],
    window: [W / 2, 2.6, -3.2],
    door: [W / 2, 2.4, D + 3.4],
  }
}

export function OutsideCamera({ room, locked }: { room: Room; locked: boolean }) {
  const angle = useStore((s) => s.outsideAngle)
  const camera = useThree((s) => s.camera)
  const controls = useRef<any>(null)
  const W = cm(room.w), D = cm(room.d)
  // Only the room's size (and where its door sits) moves the orbit: typing a name or picking a colour must not reset it.
  const target = useMemo(() => new THREE.Vector3(W / 2, 0.8, D / 2), [W, D])
  const presetKey = `${room.doors[0]?.wall ?? ''}:${room.doors[0]?.offset ?? 0}:${room.windows.map((w) => w.wall).join()}:${(room.closets ?? []).map((c) => c.wall).join()}`
  const roomRef = useRef(room)
  roomRef.current = room
  useEffect(() => {
    const p = anglePositions(roomRef.current)[angle]
    camera.position.set(...p)
    camera.lookAt(target)
    controls.current?.target.copy(target)
    controls.current?.update()
  }, [angle, W, D, presetKey, camera, target])
  return <OrbitControls ref={controls} makeDefault enabled={!locked} target={target} maxPolarAngle={Math.PI / 2 - 0.05} minDistance={1.5} maxDistance={14} enableDamping dampingFactor={0.12} />
}

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export function WalkControls({ room, items }: { room: Room; items: Item[] }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const keys = useRef<Set<string>>(new Set())
  const walkHeight = useStore((s) => s.walkHeight)

  useEffect(() => {
    const el = gl.domElement
    const held = keys.current
    let last: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => { last = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId) }
    const move = (e: PointerEvent) => {
      if (!last) return
      const dx = e.clientX - last.x, dy = e.clientY - last.y
      last = { x: e.clientX, y: e.clientY }
      const p = useStore.getState().walkPose
      useStore.getState().setWalkPose({ yaw: p.yaw - dx * 0.004, pitch: THREE.MathUtils.clamp(p.pitch - dy * 0.004, -1.2, 1.2) })
      invalidate()
    }
    const up = () => { last = null }
    const kd = (e: KeyboardEvent) => { if (!typing(e.target)) { held.add(e.key.toLowerCase()); invalidate() } }
    const ku = (e: KeyboardEvent) => held.delete(e.key.toLowerCase())
    // losing focus with W held must not leave the walker moving (and the demand loop spinning)
    const clear = () => held.clear()
    const vis = () => { if (document.visibilityState !== 'visible') held.clear() }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', vis)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', vis)
      held.clear()
    }
  }, [gl, invalidate])

  // The canvas renders on demand: a walk preset or eye-height change must request a frame.
  useEffect(() => useStore.subscribe((s, prev) => { if (s.walkPose !== prev.walkPose || s.walkHeight !== prev.walkHeight) invalidate() }), [invalidate])

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
      invalidate() // keep walking while a key is held (the canvas renders on demand)
    }
    const eye = walkHeight === 'adult' ? 1.62 : 1.08
    camera.position.set(cm(x), eye, cm(y))
    camera.rotation.order = 'YXZ'
    camera.rotation.set(p.pitch, p.yaw, 0)
  })
  return null
}
