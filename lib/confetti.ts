import confetti from 'canvas-confetti'

/**
 * School Pride confetti animation
 * Duration: 8 seconds
 * Based on: https://www.kirilv.com/canvas-confetti/
 */
export function schoolPride() {
  const end = Date.now() + 8 * 1000 // 8 seconds
  const colors = ['#0035ba', '#ffffff']

  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors: colors
    })

    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors: colors
    })

    if (Date.now() < end) {
      requestAnimationFrame(frame)
    }
  }

  frame()
}
