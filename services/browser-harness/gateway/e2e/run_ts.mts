// The server's half: callGateway asks `confirm` when the gateway says a call needs the owner, and the seal it makes
// has to be one the gateway accepts. Run by run_e2e.sh with Node 22+ (it imports the .ts directly).
import { callGateway } from '../../server/gateway.ts'

const port = process.env.E2E_PORT
let failed = 0
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ts: ${name}${ok ? '' : `  -> ${detail}`}`)
  if (!ok) failed++
}
const never = async (): Promise<boolean> => {
  throw new Error('should not have asked')
}
const counts = async (): Promise<string> => ((await callGateway('read', { maxChars: 7000 }, never)).split('\n').find((l) => l.startsWith('counts:')) ?? '')

await callGateway('open', { url: `https://localhost:${port}/` }, never)

check('a free action never asks', (await callGateway('click', { text: 'Show details' }, never)).startsWith('Clicked'))

let asked = ''
try {
  await callGateway('click', { text: 'Submit for Review' }, async (what) => ((asked = what), false))
  check('declined confirmation throws', false, 'did not throw')
} catch (e) {
  check('declined confirmation throws and does nothing', String(e).includes('did not confirm') && !(await counts()).includes('submitted'), String(e))
}
check('the owner is told exactly what', asked.startsWith('Browser: click button "Submit for Review"') && asked.includes('localhost'), asked)

const done = await callGateway('click', { text: 'Submit for Review' }, async () => true)
check('confirmed action runs with the server-made seal', done.startsWith('Clicked') && (await counts()).includes('submitted=1'), `${done} / ${await counts()}`)

try {
  await callGateway('click', { ref: 'zz-1', confirmation: 'forged', confirmKey: 'x' } as never, never)
} catch (e) {
  check('extra fields a caller sneaks in are not a way round (unknown ref fails)', !String(e).includes('should not'), String(e))
}
await callGateway('type', { field: 'Message', text: 'abc' }, never)
let enterAsked = ''
await callGateway('press', { key: 'Enter' }, async (what) => ((enterAsked = what), false)).catch(() => undefined)
check('Enter in a POST form asks through the same path', enterAsked.includes('Enter') && !(await counts()).includes('posted'), enterAsked)

console.log(failed ? `\n${failed} failed` : '\nall ts passed')
process.exit(failed ? 1 : 0)
