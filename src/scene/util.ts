/** centimetres → metres */
export const cm = (v: number) => v / 100
export const WALL_T = 0.12

export function shadeColor(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 255) * f), g = Math.min(255, ((n >> 8) & 255) * f), b = Math.min(255, (n & 255) * f)
  return `rgb(${r | 0},${g | 0},${b | 0})`
}
