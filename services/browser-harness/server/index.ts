import { defineServerService, type ServerService, type ServiceStatus } from '@meridian/service-sdk/server'
import { CDP_URL, browserStatus, callGateway } from './gateway.js'

async function status(): Promise<ServiceStatus> {
  const s = await browserStatus()
  return s.reachable ? { state: 'online' } : { state: 'offline', message: 'Chrome debug port unreachable (tunnel or browser down)' }
}

// What a click, a key or a typed field can name. One of ref, text, selector or x and y; ref comes from a snapshot.
const targetProperties = {
  ref: { type: 'string', pattern: '^[a-z0-9]{2}-[0-9]+$', description: 'The ref of an element from the latest snapshot, such as "k7-12". The most reliable way to name it.' },
  text: { type: 'string', maxLength: 200, description: 'The visible label of a button, link or field, when you did not take a snapshot. If several match you get a list to choose from.' },
  role: { type: 'string', maxLength: 30, description: 'With text, narrows it to one kind: button, link, textbox, checkbox, tab...' },
  nth: { type: 'integer', minimum: 1, maximum: 50, description: 'Which one of several matches, counting from 1.' },
  selector: { type: 'string', maxLength: 500, description: 'A CSS selector, as a last resort.' },
  x: { type: 'number', description: 'Viewport x, with y: whatever is under that point.' },
  y: { type: 'number' },
} as const

const pick = (input: Record<string, unknown> | undefined, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(keys.filter((k) => input?.[k] !== undefined).map((k) => [k, input![k]]))
const TARGET_KEYS = Object.keys(targetProperties)

type Run = (input: never, ctx: { confirm: (detail: string) => Promise<boolean> }) => Promise<unknown>
const act = (op: string, keys: readonly string[]): Run =>
  (async (input: Record<string, unknown> | undefined, ctx: { confirm: (detail: string) => Promise<boolean> }) => callGateway(op, pick(input, keys), ctx.confirm)) as unknown as Run

const actions: NonNullable<ServerService['actions']> = [
  {
    id: 'status',
    method: 'GET',
    path: '/status',
    title: 'Browser status',
    description: "Whether the owner's Chrome answers on its debug port, its version and the hosts of its open tabs. Use it first when something fails.",
    mutating: false,
    run: async () => browserStatus(),
  },
  {
    id: 'open',
    method: 'POST',
    path: '/open',
    title: 'Open a page',
    description:
      'Navigates the browser to an https URL on the allowed domains and waits for it to load. If the answer says the session is signed out, tell the owner to sign in in that Chrome window: you cannot sign in, and you must not try. Then take a snapshot to see the page.',
    mutating: false,
    input: { type: 'object', required: ['url'], additionalProperties: false, properties: { url: { type: 'string', maxLength: 2000 } } },
    run: act('open', ['url']),
  },
  {
    id: 'snapshot',
    method: 'GET',
    path: '/snapshot',
    title: 'Look at the page',
    description:
      'An outline of the page: headings and every control you can use (buttons, links, fields, tabs), each with a ref like "k7-12", plus any open dialog and the scroll position. Take one before clicking, and again after the page changes: refs from an older snapshot stop working. For the text itself use read.',
    mutating: false,
    input: { type: 'object', additionalProperties: false, properties: { viewportOnly: { type: 'boolean', description: 'Only what is on screen now.' }, max: { type: 'integer', minimum: 10, maximum: 200 } } },
    run: act('snapshot', ['viewportOnly', 'max']),
  },
  {
    id: 'read',
    method: 'GET',
    path: '/read',
    title: 'Read the page text',
    description:
      'The text of the page, a screenful at a time (about 6000 characters; call again with the offset it gives you for more). Set includeHidden to also get text inside collapsed sections, such as a message thread that is not expanded. When the text is long, say the gist out loud and put the full text on screen with compose_doc rather than reading it aloud.',
    mutating: false,
    input: { type: 'object', additionalProperties: false, properties: { offset: { type: 'integer', minimum: 0 }, maxChars: { type: 'integer', minimum: 200, maximum: 7000 }, includeHidden: { type: 'boolean' } } },
    run: act('read', ['offset', 'maxChars', 'includeHidden']),
  },
  {
    id: 'links',
    method: 'GET',
    path: '/links',
    title: 'List the page links',
    description: 'The links on the page that point to allowed domains, as text and address, to pass to open. Often quicker than clicking through a menu.',
    mutating: false,
    run: act('links', []),
  },
  {
    id: 'click',
    method: 'POST',
    path: '/click',
    title: 'Click',
    description:
      'Clicks a control: name it by ref (from a snapshot), by its text, by selector or by coordinates. Opening things, tabs and menus just happen. If the click could send, publish, delete, buy, accept, save or change something, the owner is asked on the screen first and the click happens only if they confirm; say what you are about to do before you call it. A link outside the allowed domains is refused.',
    mutating: false,
    gated: true,
    input: { type: 'object', additionalProperties: false, properties: targetProperties },
    run: act('click', TARGET_KEYS),
  },
  {
    id: 'type',
    method: 'POST',
    path: '/type',
    title: 'Type into a field',
    description:
      'Types text into a field named like click does; clear replaces what was there. It never presses Enter or submits: to send what you typed, click its button (the owner is asked) or press Enter. It refuses password, code and card fields: the owner fills those.',
    mutating: false,
    input: { type: 'object', required: ['text'], additionalProperties: false, properties: { ...targetProperties, text: { type: 'string', maxLength: 2000, description: 'What to type. With ref or selector this is the text to type; to find the field by its label use the field property instead.' }, field: { type: 'string', maxLength: 200, description: 'The visible label or placeholder of the field, when there is no ref.' }, clear: { type: 'boolean' } } },
    run: act('type', [...TARGET_KEYS.filter((k) => k !== 'text'), 'text', 'field', 'clear']),
  },
  {
    id: 'press',
    method: 'POST',
    path: '/press',
    title: 'Press a key',
    description:
      'Presses one key: Enter, Tab, Escape, Space, the arrows, PageUp, PageDown, Home, End, Backspace or Delete. Enter that would submit a form, or Enter or Space on a risky button, asks the owner first. No shortcuts.',
    mutating: false,
    gated: true,
    input: { type: 'object', required: ['key'], additionalProperties: false, properties: { key: { type: 'string', maxLength: 20 } } },
    run: act('press', ['key']),
  },
  {
    id: 'scroll',
    method: 'POST',
    path: '/scroll',
    title: 'Scroll',
    description: 'Scrolls the page up or down (or to the top or bottom), or brings a control into view by ref, text or selector.',
    mutating: false,
    input: { type: 'object', additionalProperties: false, properties: { direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'] }, amount: { type: 'integer', minimum: 50, maximum: 3000 }, ref: targetProperties.ref, text: targetProperties.text, selector: targetProperties.selector } },
    run: act('scroll', ['direction', 'amount', 'ref', 'text', 'selector']),
  },
  {
    id: 'wait',
    method: 'POST',
    path: '/wait',
    title: 'Wait for the page',
    description: 'Waits until some text or an element appears (or, with gone, disappears), up to 15 seconds. Use it after a click when the page loads slowly, instead of guessing.',
    mutating: false,
    input: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', maxLength: 200 }, selector: { type: 'string', maxLength: 500 }, gone: { type: 'boolean' }, seconds: { type: 'number', minimum: 1, maximum: 15 } } },
    run: act('wait', ['text', 'selector', 'gone', 'seconds']),
  },
  { id: 'back', method: 'POST', path: '/back', title: 'Go back', description: 'The browser\'s back button.', mutating: false, run: act('back', []) },
  { id: 'forward', method: 'POST', path: '/forward', title: 'Go forward', description: 'The browser\'s forward button.', mutating: false, run: act('forward', []) },
  {
    id: 'tabs',
    method: 'POST',
    path: '/tabs',
    title: 'Tabs',
    description: 'Lists the open tabs on allowed domains, switches to one by its number, or closes one. A click that opens a tab on an allowed domain already switches to it.',
    mutating: false,
    input: { type: 'object', additionalProperties: false, properties: { action: { type: 'string', enum: ['list', 'switch', 'close'] }, id: { type: 'integer', minimum: 1, description: "The tab's number from the list." } } },
    run: act('tabs', ['action', 'id']),
  },
  {
    id: 'screenshot',
    method: 'GET',
    path: '/screenshot',
    title: 'Screenshot the page',
    description: 'Saves a PNG of the current page and says where the file is on this machine. For when the text and the outline are not enough.',
    mutating: false,
    run: act('screenshot', []),
  },
]

export default defineServerService({
  manifest: {
    id: 'browser-harness',
    name: 'browser-harness',
    mono: 'BH',
    desc: "Operate the owner's logged-in Chrome on allowed sites, asking before anything that sends or changes",
    runtime: 'chrome',
    address: new URL(CDP_URL).host,
  },
  status,
  actions,
})
