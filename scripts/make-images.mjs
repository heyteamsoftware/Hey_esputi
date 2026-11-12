// Genera public/og.png (1200x630) y los iconos de la app sin dependencias (PNG a mano con zlib).
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}

function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    const o = y * (w * 3 + 1)
    for (let x = 0; x < w; x++) { const [r, g, b] = pixel(x, y); raw[o + 1 + x * 3] = r; raw[o + 2 + x * 3] = g; raw[o + 3 + x * 3] = b }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

const GREEN = [30, 215, 96], BLACK = [0, 0, 0]
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const smooth = (d) => Math.max(0, Math.min(1, 0.5 - d)) // suavizado de bordes

// Logotipo: círculo verde con tres barras de ecualizador (igual que favicon.svg)
function logo(x, y, cx, cy, R, bg) {
  const dist = Math.hypot(x - cx, y - cy)
  let col = mix(bg, GREEN, smooth(dist - R))
  if (dist < R) {
    const u = R / 32 // el favicon mide 64x64
    const bars = [[17, 26, 20], [28.5, 16, 30], [40, 31, 15]] // [x, y, alto], ancho 7
    for (const [bx, by, bh] of bars) {
      const px = (x - cx) / u + 32, py = (y - cy) / u + 32
      // distancia a un rectángulo redondeado (radio 3.5)
      const qx = Math.abs(px - (bx + 3.5)), qy = Math.max(0, Math.abs(py - (by + bh / 2)) - (bh / 2 - 3.5))
      col = mix(col, BLACK, smooth((Math.hypot(qx, qy) - 3.5) * u))
    }
  }
  return col
}

const og = png(1200, 630, (x, y) => {
  const t = Math.min(1, Math.hypot(x - 600, y - 315) / 700)
  const bg = mix([32, 56, 40], [18, 18, 18], t)
  return logo(x, y, 600, 315, 170, bg)
})
writeFileSync('public/og.png', og)
for (const s of [192, 512]) {
  writeFileSync(`public/icon-${s}.png`, png(s, s, (x, y) => logo(x, y, s / 2, s / 2, s * 0.36, [18, 18, 18])))
}
console.log('og.png', og.length, 'bytes')
