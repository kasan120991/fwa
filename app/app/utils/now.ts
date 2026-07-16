// Keep in sync with ../../../portal/app/utils/now.ts

const TICK_MS = 30_000

const nowMs = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

/** Reactive `Date.now()`. Reading it inside a render or a computed makes that
 *  computation re-run as time passes — which is what keeps timeAgo() strings
 *  ticking on a page that's been left open. The interval starts on first read
 *  and runs for the life of the tab (both apps are SPAs). */
export function reactiveNow(): number {
  if (import.meta.client && !timer) {
    timer = setInterval(() => {
      nowMs.value = Date.now()
    }, TICK_MS)
  }
  return nowMs.value
}
