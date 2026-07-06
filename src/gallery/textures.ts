import * as THREE from 'three'

/** Procedural dark oak plank texture for the reflective gallery floor. */
export function makeFloorTexture(): THREE.CanvasTexture {
  const size = 1024
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!

  const plankW = size / 8
  for (let i = 0; i < 8; i++) {
    const base = 30 + Math.sin(i * 12.9898) * 6 + (i % 2) * 5
    ctx.fillStyle = `rgb(${base + 14}, ${base + 3}, ${base - 8})`
    ctx.fillRect(i * plankW, 0, plankW, size)
    // grain streaks
    for (let g = 0; g < 46; g++) {
      const gx = i * plankW + ((Math.sin(i * 78.233 + g * 12.9) * 0.5 + 0.5) * plankW) | 0
      const alpha = 0.05 + (Math.sin(g * 4.7 + i) * 0.5 + 0.5) * 0.09
      ctx.strokeStyle = `rgba(12, 8, 4, ${alpha})`
      ctx.lineWidth = 1 + (g % 3)
      ctx.beginPath()
      ctx.moveTo(gx, 0)
      ctx.bezierCurveTo(gx + 6, size * 0.33, gx - 6, size * 0.66, gx + 3, size)
      ctx.stroke()
    }
    // plank gap
    ctx.fillStyle = 'rgba(5, 3, 2, 0.85)'
    ctx.fillRect(i * plankW - 1, 0, 2, size)
    // butt joints
    const joint = ((Math.sin(i * 91.7) * 0.5 + 0.5) * size) | 0
    ctx.fillRect(i * plankW, joint, plankW, 2)
  }

  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Fine plaster noise for gallery walls (used as a subtle roughness map). */
export function makePlasterTexture(): THREE.CanvasTexture {
  const size = 256
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 205 + ((Math.sin(i * 0.734) * 43758.5453) % 1) * 24
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** Coffered gallery ceiling: warm plaster panels with recessed borders. */
export function makeCeilingTexture(): THREE.CanvasTexture {
  const size = 512
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#6e675a'
  ctx.fillRect(0, 0, size, size)
  // one coffer per tile: recessed border, beveled highlight, lighter panel
  ctx.fillStyle = '#57503f'
  ctx.fillRect(14, 14, size - 28, size - 28)
  ctx.fillStyle = '#7a7263'
  ctx.fillRect(34, 34, size - 68, size - 68)
  ctx.strokeStyle = 'rgba(255, 244, 214, 0.18)'
  ctx.lineWidth = 4
  ctx.strokeRect(36, 36, size - 72, size - 72)
  ctx.fillStyle = '#847c6c'
  ctx.fillRect(52, 52, size - 104, size - 104)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Small engraved brass notice for the entrance wall (gallery etiquette). */
export function makeNoticeTexture(kind: 'quiet' | 'noflash'): THREE.CanvasTexture {
  const w = 512
  const h = 384
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  // warm brass plate with a darker recessed field
  ctx.fillStyle = '#40311c'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#4a3a22'
  ctx.fillRect(16, 16, w - 32, h - 32)
  ctx.strokeStyle = 'rgba(210,180,120,0.75)'
  ctx.lineWidth = 3
  ctx.strokeRect(22, 22, w - 44, h - 44)

  const gold = '#d9b871'
  ctx.strokeStyle = gold
  ctx.fillStyle = gold
  ctx.lineWidth = 7
  ctx.lineJoin = 'round'
  const cx = w / 2
  const iconY = 118

  if (kind === 'quiet') {
    // speaker silhouette + a "no sound" slash
    ctx.beginPath()
    ctx.moveTo(cx - 46, iconY - 20)
    ctx.lineTo(cx - 20, iconY - 20)
    ctx.lineTo(cx + 6, iconY - 42)
    ctx.lineTo(cx + 6, iconY + 42)
    ctx.lineTo(cx - 20, iconY + 20)
    ctx.lineTo(cx - 46, iconY + 20)
    ctx.closePath()
    ctx.fill()
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.moveTo(cx - 40, iconY - 46)
    ctx.lineTo(cx + 52, iconY + 46)
    ctx.stroke()
  } else {
    // camera body + lens + flash hump, with a slash
    ctx.lineWidth = 7
    ctx.strokeRect(cx - 52, iconY - 26, 104, 60)
    ctx.beginPath()
    ctx.arc(cx, iconY + 4, 20, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillRect(cx + 26, iconY - 40, 22, 14)
    ctx.beginPath()
    ctx.moveTo(cx - 58, iconY - 40)
    ctx.lineTo(cx + 58, iconY + 44)
    ctx.stroke()
  }

  ctx.fillStyle = gold
  ctx.textAlign = 'center'
  ctx.font = '600 46px "Inter", sans-serif'
  ctx.fillText(kind === 'quiet' ? 'QUIET, PLEASE' : 'NO FLASH', cx, 252)
  ctx.font = '500 30px "Inter", sans-serif'
  ctx.fillStyle = 'rgba(217,184,113,0.85)'
  ctx.fillText(kind === 'quiet' ? 'RESPECT OTHER VISITORS' : 'PHOTOGRAPHY', cx, 302)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Museum wall label for a painting: ivory card with title / year.
 *  Restricted (in-copyright) works get a small red © marker. */
export function makeLabelTexture(
  title: string,
  year: string,
  artist: string,
  restricted = false,
): THREE.CanvasTexture {
  const w = 512
  const h = 288
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#f0e9d8'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(139,108,48,0.6)'
  ctx.lineWidth = 3
  ctx.strokeRect(10, 10, w - 20, h - 20)

  ctx.fillStyle = '#2a2118'
  ctx.textAlign = 'left'
  const words = title.split(' ')
  const lines: string[] = []
  let line = ''
  ctx.font = '600 34px "Cormorant Garamond", Georgia, serif'
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > w - 90 && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  lines.push(line)
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, 44, 78 + i * 42))

  ctx.font = 'italic 26px "Cormorant Garamond", Georgia, serif'
  ctx.fillStyle = 'rgba(42,33,24,0.75)'
  ctx.fillText(artist, 44, h - 78)
  ctx.font = '22px "Inter", sans-serif'
  ctx.fillStyle = 'rgba(42,33,24,0.6)'
  ctx.fillText(year, 44, h - 40)

  if (restricted) {
    ctx.fillStyle = '#9b3728'
    ctx.font = '600 20px "Inter", sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('© IN COPYRIGHT', w - 40, h - 40)
    ctx.textAlign = 'left'
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}
