/**
 * Keep the screen on in paint mode.
 *
 * Screen Wake Lock needs a secure context (HTTPS, localhost, or Chrome's
 * "unsafely-treat-insecure-origin-as-secure" flag for the laptop's LAN URL). Without it,
 * fall back to a muted, looping, inline video, which keeps most mobile browsers awake
 * while it plays. The video is drawn from a tiny canvas, so no media file is needed.
 */

let sentinel: WakeLockSentinel | null = null
let video: HTMLVideoElement | null = null
let wanted = false

export type WakeMode = 'wake-lock' | 'video' | 'none'

async function requestLock(): Promise<boolean> {
  if (!('wakeLock' in navigator)) return false
  try {
    sentinel = await navigator.wakeLock.request('screen')
    return true
  } catch {
    return false
  }
}

function startVideo(): boolean {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const ctx = canvas.getContext('2d')!
    let flip = false
    const tick = () => {
      if (!video) return
      ctx.fillStyle = flip ? '#000' : '#010101'
      ctx.fillRect(0, 0, 2, 2)
      flip = !flip
      setTimeout(tick, 1000)
    }
    tick()
    video = document.createElement('video')
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.srcObject = canvas.captureStream(1)
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;bottom:0;left:0'
    document.body.append(video)
    video.play().catch(() => {
      /* interrupted when paint mode ends quickly; nothing to do */
    })
    return true
  } catch {
    return false
  }
}

/** Keep the screen on. Call from a tap handler. Returns which method is active. */
export async function keepAwake(): Promise<WakeMode> {
  wanted = true
  if (await requestLock()) return 'wake-lock'
  return startVideo() ? 'video' : 'none'
}

export function allowSleep(): void {
  wanted = false
  void sentinel?.release()
  sentinel = null
  video?.remove()
  video = null
}

// The lock is dropped when the tab is hidden; take it again on return.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (wanted && document.visibilityState === 'visible' && !video) void requestLock()
  })
}
