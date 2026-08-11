import { createEffect, createSignal, For, onCleanup, onMount } from "solid-js"

export const logoThin = {
  left: [
    "                              ",
    "                              ",
    "▄████▄ █████▄ ██████ ▀██  ██▀ ",
    "██▄▄██ ██▄▄██ ████▄    ████   ",
    "██  ██ ██     ██▄▄▄▄ ▄██  ██▄ ",
    "                              ",
  ],
  right: [
    "                                      ",
    "                                      ",
    "▄████▄ █████▄  ▄█████    ▄██     ▄██▄ ",
    "██▄▄██ ██▄▄██▄ ██         ██     ████ ",
    "██  ██ ██   ██ ▀█████    ▄██▄ ▀  ▀██▀ ",
    "                                      ",
  ],
}

export const logoClassic = {
  left: [
    " █████╗ ██████╗ ███████╗██╗  ██╗",
    "██╔══██╗██╔══██╗██╔════╝╚██╗██╔╝",
    "███████║██████╔╝█████╗   ╚███╔╝ ",
    "██╔══██║██╔═══╝ ██╔══╝   ██╔██╗ ",
    "██║  ██║██║     ███████╗██╔╝ ██╗",
    "╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝",
    "                                ",
  ],
  right: [
    " █████╗ ██████╗  ██████╗     ██╗    ██████╗ ",
    "██╔══██╗██╔══██╗██╔════╝    ███║   ██╔═████╗",
    "███████║██████╔╝██║         ╚██║   ██║██╔██║",
    "██╔══██║██╔══██╗██║          ██║   ████╔╝██║",
    "██║  ██║██║  ██║╚██████╗     ██║██╗╚██████╔╝",
    "╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝     ╚═╝╚═╝ ╚═════╝ ",
    "                                            ",
  ],
}

export function TuiLogo(props: { variant?: "thin" | "classic" }) {
  const shape = () => (props.variant === "classic" ? logoClassic : logoThin)
  const [sweepPos, setSweepPos] = createSignal(-10)

  let timer: ReturnType<typeof setInterval> | undefined

  onMount(() => {
    timer = setInterval(() => {
      setSweepPos((prev) => {
        if (prev > 80) return -20
        return prev + 2
      })
    }, 50)
  })

  onCleanup(() => {
    if (timer) clearInterval(timer)
  })

  const getCharColor = (x: number, isRight: boolean) => {
    const adjustedX = isRight ? x + 35 : x
    const dist = Math.abs(adjustedX - sweepPos())
    if (dist < 3) return "text-emerald-200 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]"
    if (dist < 6) return isRight ? "text-emerald-400 opacity-90" : "text-emerald-400"
    return isRight ? "text-emerald-600 opacity-80" : "text-emerald-500"
  }

  return (
    <div class="flex flex-col items-center select-none font-mono text-12-mono leading-none tracking-normal">
      <For each={shape().left}>
        {(line, index) => (
          <div class="flex flex-row gap-4 flex-nowrap">
            <div class="flex flex-row whitespace-pre">
              {Array.from(line).map((char, x) => (
                <span class={getCharColor(x, false)}>{char}</span>
              ))}
            </div>
            <div class="flex flex-row whitespace-pre">
              {Array.from(shape().right[index()] ?? "").map((char, x) => (
                <span class={getCharColor(x, true)}>{char}</span>
              ))}
            </div>
          </div>
        )}
      </For>
    </div>
  )
}
