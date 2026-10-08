import type { ActionContext } from '@meridian/service-sdk/server'
import type { SendLimiter } from './send-policy.js'

interface Flow {
  ctx: ActionContext
  limiter: SendLimiter
  to: string
  what: string
  send: () => Promise<unknown>
  audit: (message: string) => void
}

// The only road to a send: within the limit, then the owner says yes on the screen, then it goes. Nothing is
// sent, or counted, on any other path.
export async function confirmedSend({ ctx, limiter, to, what, send, audit }: Flow): Promise<{ sent: true; to: string }> {
  limiter.check()
  if (!(await ctx.confirm(`WhatsApp to ${to}: ${what}`))) throw new Error('The owner did not confirm this, so it was not sent.')
  limiter.check()
  await send()
  limiter.record()
  audit(`sent to ${to}`)
  return { sent: true, to }
}
