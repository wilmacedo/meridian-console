// What NOX says when it is about to do something slow and has not said a word yet, so the owner is not
// left in silence while a tool runs. The model is asked to do this itself, in words fitted to the request;
// this is for when it doesn't.
const ACKS = ['Entendi, vou ver isso.', 'Certo, já estou verificando.', 'Ok, deixa comigo.', 'Entendido, vou trabalhar nisso.', 'Beleza, vou dar uma olhada.']

const SLOW_TOOLS = new Set(['Bash', 'call_service_action', 'list_containers', 'add_service', 'edit_service', 'start_task'])

// Reading from a machine or a service takes a while; opening a window or reading local state does not.
export const isSlowTool = (name: string): boolean => SLOW_TOOLS.has(name) || name.startsWith('service_')

export const pickAck = (random: () => number = Math.random): string => ACKS[Math.floor(random() * ACKS.length)]
