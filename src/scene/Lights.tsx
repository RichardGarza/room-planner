import type { Room } from '../types'
import { cm } from './util'

/* --------------------------------- lights --------------------------------- */

export function Lights({ room, daytime }: { room: Room; daytime: boolean }) {
  const cx = cm(room.w) / 2, cz = cm(room.d) / 2
  const win = room.windows[0]
  const wx = win ? cm(win.offset + win.width / 2) : cx
  return daytime ? (
    <>
      <ambientLight intensity={0.55} color="#fff6ea" />
      <hemisphereLight args={['#dbe8ff', '#d3c2b6', 0.7]} />
      <directionalLight
        position={[wx + 0.4, 4.5, -3.5]}
        target-position={[wx, 0.6, 1.8]}
        intensity={2.2}
        color="#fff3dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      <pointLight position={[cx, cm(room.h) - 0.3, cz]} intensity={0.35} color="#fff" distance={6} />
    </>
  ) : (
    <>
      <ambientLight intensity={0.18} color="#d9c7ff" />
      <hemisphereLight args={['#2a3350', '#3a2a22', 0.35]} />
      <pointLight position={[cx, cm(room.h) - 0.25, cz]} intensity={3.5} color="#ffd6a0" distance={7} decay={1.6} castShadow shadow-bias={-0.0006} />
      <pointLight position={[wx, 1.6, -1.2]} intensity={0.5} color="#7c8fdd" distance={5} />
    </>
  )
}
