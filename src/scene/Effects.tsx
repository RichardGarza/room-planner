import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { RenderPass, ToneMappingMode } from 'postprocessing'
import type { Camera, Scene } from 'three'

/* ------------------------------ post-processing ----------------------------- */

/** The scene pass must also clear the stencil buffer: the window masks rewrite it every frame. */
const renderPass = (scene: Scene, camera: Camera) => {
  const pass = new RenderPass(scene, camera)
  pass.clearPass.setClearFlags(true, true, true)
  return pass
}

/**
 * Ambient occlusion in the corners and under the furniture, SMAA for edges, a whisper of
 * vignette, a bloom on the lamp in the evening, then ACES tone mapping. Only mounted on quality "best".
 */
export function Effects({ daytime }: { daytime: boolean }) {
  return (
    <EffectComposer multisampling={0} stencilBuffer enableNormalPass={false} renderPass={renderPass}>
      <N8AO aoRadius={0.4} distanceFalloff={0.5} intensity={1.6} quality="medium" halfRes />
      {daytime ? null : <Bloom mipmapBlur luminanceThreshold={1.1} intensity={0.45} radius={0.45} />}
      <SMAA />
      <Vignette eskil={false} offset={0.2} darkness={0.32} />
      {/* the composer turns the renderer's tone mapping off, so ACES is applied here, last */}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
