import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"

const DENSITY = 0.00394
const TWINKLE_INTERVAL = 200
const METEOR_INTERVAL = 8000
const METEOR_DURATION = 3600
const METEOR_ANGLE = 0.36
const METEOR_TAIL = 32
const HOT_THRESHOLD = 0.88

type Star = {
  x: number
  y: number
  brightness: number
  char: string
}

type Meteor = {
  at: number
  startX: number
  startY: number
  speed: number
}

export function StarryBackground(props: { meteor?: () => boolean }) {
  let canvasRef: HTMLCanvasElement | undefined
  const [stars, setStars] = createSignal<Star[]>([])
  const [meteor, setMeteor] = createSignal<Meteor | undefined>()
  const [dimensions, setDimensions] = createSignal({ w: window.innerWidth, h: window.innerHeight })

  let timer: ReturnType<typeof setInterval> | undefined
  let meteorTimer: ReturnType<typeof setInterval> | undefined
  let animFrame: number | undefined

  const initStars = (w: number, h: number) => {
    const starList: Star[] = []
    const count = Math.floor(w * h * DENSITY * 0.05)
    const chars = ["✦", "✧", "✶"]

    for (let i = 0; i < count; i++) {
      starList.push({
        x: Math.random() * w,
        y: Math.random() * h,
        brightness: 0.15 + Math.random() * 0.4,
        char: chars[Math.floor(Math.random() * chars.length)] ?? "✦",
      })
    }
    setStars(starList)
  }

  const handleResize = () => {
    if (!canvasRef) return
    const w = window.innerWidth
    const h = window.innerHeight
    canvasRef.width = w
    canvasRef.height = h
    setDimensions({ w, h })
    initStars(w, h)
  }

  onMount(() => {
    handleResize()
    window.addEventListener("resize", handleResize)

    timer = setInterval(() => {
      setStars((prev) =>
        prev.map((star) => {
          if (Math.random() < 0.15) {
            const r = Math.random()
            const brightness =
              r < 0.12 ? 0.92 + Math.random() * 0.08 : r < 0.8 ? 0.7 + Math.random() * 0.22 : 0.05 + Math.random() * 0.2
            return { ...star, brightness }
          }
          return star
        }),
      )
    }, TWINKLE_INTERVAL)

    meteorTimer = setInterval(() => {
      if (props.meteor && !props.meteor()) return
      const { w, h } = dimensions()
      const startY = Math.random() * (h * 0.3)
      const speed = Math.max(0.15, Math.min(0.45, (h - startY) / METEOR_DURATION))
      setMeteor({
        at: performance.now(),
        startX: w - Math.random() * Math.max(1, w * 0.2),
        startY,
        speed,
      })
    }, METEOR_INTERVAL)

    const render = () => {
      if (!canvasRef) return
      const ctx = canvasRef.getContext("2d")
      if (!ctx) return

      const { w, h } = dimensions()
      ctx.clearRect(0, 0, w, h)

      // Render Stars
      ctx.font = "12px monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"

      const starList = stars()
      for (const star of starList) {
        const isHot = star.brightness >= HOT_THRESHOLD
        const alpha = Math.min(1, star.brightness)
        ctx.fillStyle = isHot ? `rgba(255, 255, 255, ${alpha})` : `rgba(134, 239, 172, ${alpha * 0.85})`
        ctx.fillText(star.char, star.x, star.y)
      }

      // Render Meteor
      const m = meteor()
      if (m) {
        const elapsed = performance.now() - m.at
        if (elapsed >= 0 && elapsed <= METEOR_DURATION) {
          const distance = elapsed * m.speed * 10
          const dx = -Math.cos(METEOR_ANGLE)
          const dy = Math.sin(METEOR_ANGLE)
          const headX = m.startX + distance * dx
          const headY = m.startY + distance * dy

          const tailX = headX - METEOR_TAIL * 8 * dx
          const tailY = headY - METEOR_TAIL * 8 * dy

          const gradient = ctx.createLinearGradient(headX, headY, tailX, tailY)
          gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)")
          gradient.addColorStop(0.3, "rgba(134, 239, 172, 0.7)")
          gradient.addColorStop(1, "rgba(21, 128, 61, 0)")

          ctx.beginPath()
          ctx.moveTo(headX, headY)
          ctx.lineTo(tailX, tailY)
          ctx.strokeStyle = gradient
          ctx.lineWidth = 2.5
          ctx.lineCap = "round"
          ctx.stroke()

          // Meteor core head
          ctx.beginPath()
          ctx.arc(headX, headY, 2, 0, Math.PI * 2)
          ctx.fillStyle = "rgba(255, 255, 255, 1)"
          ctx.fill()
        } else if (elapsed > METEOR_DURATION) {
          setMeteor(undefined)
        }
      }

      animFrame = requestAnimationFrame(render)
    }

    animFrame = requestAnimationFrame(render)
  })

  onCleanup(() => {
    window.removeEventListener("resize", handleResize)
    if (timer) clearInterval(timer)
    if (meteorTimer) clearInterval(meteorTimer)
    if (animFrame) cancelAnimationFrame(animFrame)
  })

  return (
    <canvas
      ref={canvasRef}
      class="fixed inset-0 pointer-events-none z-0"
      style={{ background: "transparent" }}
    />
  )
}
