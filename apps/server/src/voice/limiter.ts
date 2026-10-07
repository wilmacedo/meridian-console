// Lets at most `max` calls run at once; the rest wait their turn, in order. ElevenLabs refuses more than a
// handful of parallel requests per account (429), and a long answer is many sentences.
export function limiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let running = 0
  const waiting: (() => void)[] = []
  const next = (): void => {
    running--
    waiting.shift()?.()
  }
  return async (task) => {
    if (running >= max) await new Promise<void>((resolve) => waiting.push(resolve))
    running++
    try {
      return await task()
    } finally {
      next()
    }
  }
}
