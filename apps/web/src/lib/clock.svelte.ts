export const clock = $state({ now: new Date() })

export function startClock(): () => void {
  const timer = setInterval(() => (clock.now = new Date()), 1000)
  return () => clearInterval(timer)
}
