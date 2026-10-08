// Every screen in earshot hears the same wake word. The claims that arrive within a short window are one wake-up, and
// only the screen that heard it best answers; the others drop what they started recording.
export const WAKE_WINDOW_MS = 400

export class WakeArbiter {
  private claims: { score: number; reply: (granted: boolean) => void }[] = []

  constructor(private windowMs = WAKE_WINDOW_MS) {}

  claim(score: number, reply: (granted: boolean) => void): void {
    if (!this.claims.length) setTimeout(() => this.settle(), this.windowMs)
    this.claims.push({ score, reply })
  }

  private settle(): void {
    const claims = this.claims
    this.claims = []
    const best = claims.reduce((a, b) => (b.score > a.score ? b : a))
    for (const c of claims) c.reply(c === best)
  }
}
