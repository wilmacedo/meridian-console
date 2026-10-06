import type { WebService } from '@meridian/service-sdk/web'

// Every services/<id>/web/index.ts is picked up at build time, so adding a service's UI means adding
// its folder, with no registration step here.
const modules = import.meta.glob<{ default: WebService }>('../../../../../services/*/web/index.ts', { eager: true })

const byId = new Map<string, WebService>()
for (const [path, module] of Object.entries(modules)) {
  const id = /\/services\/([^/]+)\/web\//.exec(path)?.[1]
  if (id) byId.set(id, module.default)
}

export const webServiceFor = (id: string): WebService | undefined => byId.get(id)
