import { useEffect, useImperativeHandle, useRef, type MutableRefObject, type Ref } from 'react'

export type HelixPoint = { x: number; y: number }
export interface HelixHandle {
  captureRandom(): boolean
  release(): void
  redraw(): void
}
interface ParticleHelixProps {
  paused?: boolean
  interactive?: boolean
  linkRef?: MutableRefObject<HelixPoint | null>
  onCapture?: (point: HelixPoint | null) => void
  ref?: Ref<HelixHandle>
}

type Point = { x: number; y: number; depth: number }
type Particle = { t: number; strand: number; filament: number; radius: number; size: number; brightness: number; color: number; scatterX: number; scatterY: number }

const TAU = Math.PI * 2
const INTRO_DURATION = 1.6
const NODE_COUNT = 10
// Pointer-driven cards fade by themselves once the cursor leaves or rests; button-driven cards wait for Escape/toggle.
const IDLE_FADE_DELAY = 5000
const COLORS = ['104, 232, 204', '236, 214, 154', '238, 255, 248']

function smooth(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return t * t * (3 - 2 * t)
}

function makeParticles(count: number): Particle[] {
  // A fixed seed keeps resize, StrictMode and static renders reproducible.
  let seed = 0x7a4d39b1
  const random = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) / 4294967296
  }
  return Array.from({ length: count }, (_, i) => ({
    t: (i + random() * 0.8) / count,
    strand: i % 2,
    filament: ((i % 9) - 4) * 0.045 + (random() - 0.5) * 0.05,
    radius: 0.93 + random() * 0.14,
    size: 0.85 + random() ** 2 * 1.9,
    brightness: 0.55 + random() * 0.45,
    color: i % 13 === 0 ? 2 : i % 5 === 0 ? 1 : 0,
    scatterX: (random() - 0.5) * 2,
    scatterY: (random() - 0.5) * 2,
  }))
}

function makeGlow(color: string) {
  const sprite = document.createElement('canvas')
  sprite.width = sprite.height = 64
  const context = sprite.getContext('2d')
  if (!context) return sprite
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, `rgba(${color}, 1)`)
  gradient.addColorStop(0.16, `rgba(${color}, 0.95)`)
  gradient.addColorStop(0.3, `rgba(${color}, 0.5)`)
  gradient.addColorStop(0.55, `rgba(${color}, 0.1)`)
  gradient.addColorStop(1, `rgba(${color}, 0)`)
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  return sprite
}

export default function ParticleHelix({ paused = false, interactive = true, linkRef, onCapture, ref }: ParticleHelixProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pausedRef = useRef(paused)
  const interactiveRef = useRef(interactive)
  const onCaptureRef = useRef(onCapture)
  const linkHolder = useRef(linkRef)
  const apiRef = useRef<(HelixHandle & { sync(): void }) | null>(null)
  onCaptureRef.current = onCapture
  linkHolder.current = linkRef

  useImperativeHandle(ref, () => ({
    captureRandom: () => apiRef.current?.captureRandom() ?? false,
    release: () => apiRef.current?.release(),
    redraw: () => apiRef.current?.redraw(),
  }), [])

  useEffect(() => { pausedRef.current = paused; apiRef.current?.sync() }, [paused])
  useEffect(() => { interactiveRef.current = interactive; if (!interactive) apiRef.current?.release() }, [interactive])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) return
    const ctx = context
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const smallQuery = window.matchMedia('(max-width: 760px), (pointer: coarse)')
    const sprites = COLORS.map(makeGlow)
    let particles: Particle[] = []
    // x, y, visible alpha of every particle and node from the latest drawn frame.
    let positions = new Float32Array(0)
    let width = 0
    let height = 0
    let dpr = 1
    let dirX = 0
    let dirY = 0
    let normalX = 0
    let normalY = 0
    let coilRadius = 0
    let time = 0
    let clock = 0
    let introTime = 0
    let timeScale = 1
    let previousTime: number | null = null
    let frameAccum = 0
    let frameId: number | null = null
    let running = false
    let disposed = false
    let captured: number | null = null
    let releaseTimer: ReturnType<typeof setTimeout> | null = null
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    const point: Point = { x: 0, y: 0, depth: 0 }
    const previous: Point = { x: 0, y: 0, depth: 0 }

    function project(t: number, strand: number, filament: number, radius: number, out: Point) {
      const angle = t * TAU * 1.55 + strand * Math.PI + filament - time * 0.12
      const envelope = Math.sin(Math.PI * t) ** 0.6
      const z = Math.sin(angle)
      const perspective = 1 / (1 - z * 0.2)
      const r = coilRadius * envelope * radius
      const across = Math.cos(angle) * r * perspective
      const along = z * r * 0.16
      out.x = width * (0.04 + t * 0.98) + normalX * across + dirX * along
      out.y = height * (1.02 - t * 0.92) + normalY * across + dirY * along
      out.depth = (z + 1) * 0.5
    }

    function quietZone(x: number, y: number) {
      const nx = x / width
      const ny = y / height
      const text = (1 - smooth(0.38, 0.58, nx)) * smooth(0.12, 0.22, ny) * (1 - smooth(0.6, 0.72, ny))
      const header = 1 - smooth(0.05, 0.12, ny)
      return (1 - text * 0.72) * (1 - header * 0.65)
    }

    function assembly(t: number, intro: number) {
      return smooth(t * 0.58, t * 0.58 + 0.42, intro)
    }

    const colorStr = COLORS.map(c => `rgb(${c})`)
    let radii = new Float32Array(0)
    function glow(x: number, y: number, radius: number, color: number, alpha: number) {
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
      ctx.drawImage(sprites[color], x - radius, y - radius, radius * 2, radius * 2)
    }

    function drawCapture() {
      if (captured === null) return
      const px = positions[captured * 3]
      const py = positions[captured * 3 + 1]
      const pulse = 0.5 + 0.5 * Math.sin(clock * 3.2)
      ctx.globalCompositeOperation = 'lighter'
      glow(px, py, 26, 2, 0.5)
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = 'rgb(238, 255, 248)'
      ctx.lineWidth = 1.3
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.arc(px, py, 6 + pulse * 2.5, 0, TAU)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgb(238, 255, 248)'
      ctx.beginPath()
      ctx.arc(px, py, 2.6, 0, TAU)
      ctx.fill()

      const anchor = linkHolder.current?.current
      if (!anchor) return
      const mx = (px + anchor.x) / 2
      const my = Math.min(py, anchor.y) - Math.min(60, Math.abs(anchor.x - px) * 0.18 + 14)
      ctx.strokeStyle = 'rgba(236, 214, 154, 0.9)'
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.quadraticCurveTo(mx, my, anchor.x, anchor.y)
      ctx.globalAlpha = 0.85
      ctx.lineWidth = 1.3
      ctx.setLineDash([3, 6])
      ctx.lineDashOffset = -clock * 22
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgb(236, 214, 154)'
      ctx.beginPath()
      ctx.arc(anchor.x, anchor.y, 3.2, 0, TAU)
      ctx.fill()
    }

    function draw() {
      if (width <= 0 || height <= 0 || disposed) return
      const intro = Math.min(1, introTime / INTRO_DURATION)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      ctx.setLineDash([])
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      // Silk threads: one polyline per strand (2 strokes) instead of hundreds.
      ctx.lineWidth = 1
      for (let strand = 0; strand < 2; strand += 1) {
        ctx.strokeStyle = colorStr[strand === 1 ? 1 : 0]
        ctx.globalAlpha = 0.06 * intro
        ctx.beginPath()
        project(0, strand, 0, 1, previous)
        ctx.moveTo(previous.x, previous.y)
        for (let step = 1; step <= 40; step += 1) {
          project(step / 40, strand, 0, 1, point)
          ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
      }

      // Particles: plain filled arcs batched by color (no per-particle sprite).
      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i]
        const t = (particle.t + time * 0.008) % 1
        project(t, particle.strand, particle.filament, particle.radius, point)
        const assembled = assembly(t, intro)
        const scatter = (1 - assembled) ** 2
        const x = point.x + particle.scatterX * width * 0.15 * scatter
        const y = point.y + particle.scatterY * height * 0.15 * scatter
        const taper = smooth(0, 0.065, t) * (1 - smooth(0.93, 1, t))
        const alpha = particle.brightness * (0.22 + point.depth * 0.7) * (0.025 + assembled * 0.975) * taper * quietZone(x, y)
        positions[i * 3] = x
        positions[i * 3 + 1] = y
        positions[i * 3 + 2] = alpha
        radii[i] = particle.size * (0.7 + point.depth * 0.95)
      }
      for (let c = 0; c < 3; c += 1) {
        ctx.fillStyle = colorStr[c]
        for (let i = 0; i < particles.length; i += 1) {
          if (particles[i].color !== c) continue
          const alpha = positions[i * 3 + 2]
          if (alpha <= 0.02) continue
          ctx.globalAlpha = alpha
          ctx.beginPath()
          ctx.arc(positions[i * 3], positions[i * 3 + 1], radii[i], 0, TAU)
          ctx.fill()
        }
      }

      // Bright nodes: single small glow + core + one link each.
      ctx.lineWidth = 0.6
      for (let i = 0; i < NODE_COUNT; i += 1) {
        const t = (0.08 + i * (0.84 / NODE_COUNT) + time * 0.008) % 1
        const strand = i % 2
        project(t, strand, 0, 1, point)
        const x = point.x
        const y = point.y
        const depth = point.depth
        const alpha = assembly(t, intro) * quietZone(x, y) * smooth(0.03, 0.12, t) * (1 - smooth(0.88, 0.99, t))
          * (0.6 + depth * 0.4) * (0.9 + Math.sin(clock * 0.65 + i * 2.3) * 0.1)
        const color = i % 3 === 0 ? 1 : 2
        const radius = 1.5 + depth * 1.5
        const index = particles.length + i
        positions[index * 3] = x
        positions[index * 3 + 1] = y
        positions[index * 3 + 2] = alpha
        glow(x, y, radius * 6, color, alpha * 0.5)
        ctx.fillStyle = colorStr[color]
        ctx.globalAlpha = alpha * 0.9
        ctx.beginPath()
        ctx.arc(x, y, radius * 0.75, 0, TAU)
        ctx.fill()
      }
      drawCapture()
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    function frame(timestamp: number) {
      frameId = null
      if (!running || disposed) return
      const delta = previousTime === null ? 0 : Math.min(0.05, Math.max(0, (timestamp - previousTime) / 1000))
      previousTime = timestamp
      timeScale += ((captured === null ? 1 : 0.14) - timeScale) * Math.min(1, delta * 3.5)
      time += delta * timeScale
      clock += delta
      introTime = Math.min(INTRO_DURATION, introTime + delta)
      // Cap at ~30fps: software rendering makes 60fps of this scene needlessly costly.
      frameAccum += delta
      if (frameAccum >= 1 / 30) { frameAccum = 0; draw() }
      frameId = window.requestAnimationFrame(frame)
    }

    function synchronize() {
      if (disposed) return
      const staticMode = pausedRef.current || motionQuery.matches
      if (staticMode) introTime = INTRO_DURATION
      const shouldAnimate = !staticMode && !document.hidden && width > 0 && height > 0
      canvas!.dataset.animating = String(shouldAnimate)
      canvas!.dataset.reducedMotion = String(motionQuery.matches)
      canvas!.dataset.paused = String(pausedRef.current)
      if (!shouldAnimate) {
        running = false
        if (frameId !== null) window.cancelAnimationFrame(frameId)
        frameId = null
        previousTime = null
      }
      draw()
      if (shouldAnimate && !running) {
        running = true
        previousTime = null
        frameId = window.requestAnimationFrame(frame)
      }
    }

    function nearest(x: number, y: number, radius: number) {
      let best = -1
      let bestDistance = radius * radius
      const total = positions.length / 3
      for (let i = 0; i < total; i += 1) {
        if (positions[i * 3 + 2] < 0.14) continue
        const dx = positions[i * 3] - x
        const dy = positions[i * 3 + 1] - y
        const distance = dx * dx + dy * dy
        if (distance < bestDistance) { bestDistance = distance; best = i }
      }
      return best
    }
    const ready = () => interactiveRef.current && introTime >= INTRO_DURATION && width > 0
    // The corridor between the point and its card keeps the link while the pointer travels to the card.
    function nearLink(x: number, y: number) {
      const anchor = linkHolder.current?.current
      if (captured === null || !anchor) return false
      const px = positions[captured * 3]
      const py = positions[captured * 3 + 1]
      const dx = anchor.x - px
      const dy = anchor.y - py
      const length = dx * dx + dy * dy || 1
      const t = Math.max(0, Math.min(1, ((x - px) * dx + (y - py) * dy) / length))
      return Math.hypot(x - (px + t * dx), y - (py + t * dy)) < 64
    }
    function cancelRelease() { if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null } }
    function clearIdle() { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null } }
    function armIdle() { clearIdle(); if (captured !== null) idleTimer = setTimeout(() => { idleTimer = null; release() }, IDLE_FADE_DELAY) }
    function scheduleRelease(delay: number) {
      if (captured === null || releaseTimer) return
      releaseTimer = setTimeout(() => { releaseTimer = null; release() }, delay)
    }
    function capture(index: number, idle: boolean) {
      cancelRelease()
      clearIdle()
      captured = index
      canvas!.dataset.captured = 'true'
      onCaptureRef.current?.({ x: positions[index * 3], y: positions[index * 3 + 1] })
      if (idle) armIdle()
      if (!running) draw()
    }
    function release() {
      cancelRelease()
      clearIdle()
      if (captured === null) return
      captured = null
      canvas!.dataset.captured = 'false'
      onCaptureRef.current?.(null)
      if (!running) draw()
    }
    function locate(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const target = event.target instanceof Element ? event.target : null
      return { x, y, inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height, keep: !!target?.closest('[data-helix-keep]'), ignore: !!target?.closest('[data-helix-ignore], dialog') }
    }
    function onMove(event: PointerEvent) {
      if (event.pointerType === 'touch' || !ready()) return
      const { x, y, inside, keep, ignore } = locate(event)
      if (keep) { cancelRelease(); armIdle(); return }
      if (ignore || !inside) { scheduleRelease(500); return }
      const hit = nearest(x, y, 22)
      if (captured === null) { if (hit >= 0) capture(hit, true); return }
      const distance = Math.hypot(x - positions[captured * 3], y - positions[captured * 3 + 1])
      if (distance < 100 || nearLink(x, y)) { cancelRelease(); armIdle(); return }
      if (hit >= 0 && hit !== captured && distance > 120) { capture(hit, true); return }
      scheduleRelease(650)
    }
    function onDown(event: PointerEvent) {
      if (event.pointerType === 'mouse' || !ready()) return
      const { x, y, inside, keep, ignore } = locate(event)
      if (keep || ignore || !inside) return
      const hit = nearest(x, y, 40)
      if (hit >= 0) capture(hit, true)
      else release()
    }
    const onLeave = () => scheduleRelease(400)
    function captureRandom() {
      if (!interactiveRef.current || width <= 0) return false
      if (!running) draw()
      const candidates: number[] = []
      const total = positions.length / 3
      for (let i = 0; i < total; i += 1) {
        const x = positions[i * 3]
        const y = positions[i * 3 + 1]
        if (positions[i * 3 + 2] > 0.5 && x > width * 0.12 && x < width * 0.9 && y > height * 0.14 && y < height * 0.88) candidates.push(i)
      }
      if (!candidates.length) return false
      capture(candidates[Math.floor(Math.random() * candidates.length)], false)
      return true
    }

    function resize() {
      if (disposed) return
      const rect = canvas!.getBoundingClientRect()
      const nextWidth = Number.isFinite(rect.width) ? Math.max(0, rect.width) : 0
      const nextHeight = Number.isFinite(rect.height) ? Math.max(0, rect.height) : 0
      if (Math.abs(nextWidth - width) > 1 || Math.abs(nextHeight - height) > 1) release()
      width = nextWidth
      height = nextHeight
      dpr = 1
      const pixelWidth = Math.max(1, Math.ceil(width * dpr))
      const pixelHeight = Math.max(1, Math.ceil(height * dpr))
      if (canvas!.width !== pixelWidth) canvas!.width = pixelWidth
      if (canvas!.height !== pixelHeight) canvas!.height = pixelHeight
      const length = Math.hypot(width * 0.98, height * 0.92) || 1
      dirX = width * 0.98 / length
      dirY = -height * 0.92 / length
      normalX = height * 0.92 / length
      normalY = width * 0.98 / length
      coilRadius = Math.min(Math.max(width, height) * 0.11, Math.min(width, height) * 0.3)
      const count = smallQuery.matches || width < 480 ? 200 : 380
      if (particles.length !== count) {
        particles = makeParticles(count)
        positions = new Float32Array((count + NODE_COUNT) * 3)
        radii = new Float32Array(count)
      }
      canvas!.dataset.particleCount = String(count)
      synchronize()
    }

    apiRef.current = { sync: synchronize, captureRandom, release, redraw: () => { if (!running) draw() } }
    canvas.dataset.captured = 'false'
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(canvas)
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', synchronize)
    motionQuery.addEventListener('change', synchronize)
    smallQuery.addEventListener('change', resize)
    resize()

    return () => {
      disposed = true
      running = false
      cancelRelease()
      clearIdle()
      apiRef.current = null
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', synchronize)
      motionQuery.removeEventListener('change', synchronize)
      smallQuery.removeEventListener('change', resize)
      canvas.dataset.animating = 'false'
    }
  }, [])

  return <canvas ref={canvasRef} className="login-helix-canvas" aria-hidden="true" />
}
