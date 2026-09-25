import { Bloom, EffectComposer, N8AO, Outline, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { KernelSize, RenderPass, ToneMappingMode } from 'postprocessing'
import type { Camera, Scene } from 'three'

/* ------------------------------ post-processing ----------------------------- */

/** The scene pass must also clear the stencil buffer: the window masks rewrite it every frame. */
const renderPass = (scene: Scene, camera: Camera) => {
  const pass = new RenderPass(scene, camera)
  pass.clearPass.setClearFlags(true, true, true)
  return pass
}

/**
 * Ambient occlusion in the corners and under the furniture, a pink outline around the selected
 * piece (fed by the <Selection> context the furniture is mounted in), SMAA for edges, a whisper
 * of vignette, a bloom on the lamp in the evening, then ACES tone mapping. Only mounted on
 * quality "best". The composer's autoClear is off because the outline pass keeps its own mask
 * buffer; our render pass clears colour, depth and stencil explicitly.
 */
export function Effects({ daytime }: { daytime: boolean }) {
  return (
    <EffectComposer multisampling={0} stencilBuffer enableNormalPass={false} renderPass={renderPass} autoClear={false}>
      <N8AO aoRadius={0.4} distanceFalloff={0.5} intensity={1.6} quality="medium" halfRes />
      <Outline edgeStrength={3} visibleEdgeColor={0xe5407a} hiddenEdgeColor={0xe5407a} xRay={false} blur kernelSize={KernelSize.SMALL} />
      {daytime ? null : <Bloom mipmapBlur luminanceThreshold={1.5} intensity={0.3} radius={0.45} />}
      <SMAA />
      <Vignette eskil={false} offset={0.2} darkness={0.32} />
      {/* the composer turns the renderer's tone mapping off, so ACES is applied here, last */}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
