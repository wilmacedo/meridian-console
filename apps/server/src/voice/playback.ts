const waiting = new Map<number, () => void>()

// Resolves when the screen reports it finished playing the turn, or after `timeoutMs` in case it never will
// (a closed tab, a browser that wouldn't play).
export function waitForPlayback(turn: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(), timeoutMs)
    const finish = (): void => {
      clearTimeout(timer)
      waiting.delete(turn)
      resolve()
    }
    waiting.set(turn, finish)
  })
}

export function playbackDone(turn: number): void {
  waiting.get(turn)?.()
}
