import type { ServicePageSection, ServiceWidget, ServiceWindow, WebService } from '@meridian/service-sdk/web'

// Every services/<id>/web/index.ts is picked up at build time, so adding a service's UI means adding
// its folder, with no registration step here.
const modules = import.meta.glob<{ default: WebService }>('../../../../../services/*/web/index.ts', { eager: true })

export interface ContributedWindow extends ServiceWindow {
  serviceId: string
  // Id of the window on the stage: the module's own for module windows, else service-scoped.
  windowId: string
}

export interface ContributedWidget extends ServiceWidget {
  serviceId: string
}

const windows: ContributedWindow[] = []
const widgets: ContributedWidget[] = []
const sections: Record<string, ServicePageSection[]> = {}

for (const [path, module] of Object.entries(modules)) {
  const serviceId = /\/services\/([^/]+)\/web\//.exec(path)?.[1]
  if (!serviceId) continue
  for (const w of module.default.windows ?? []) windows.push({ ...w, serviceId, windowId: w.module ?? `${serviceId}:${w.id}` })
  for (const w of module.default.widgets ?? []) widgets.push({ ...w, serviceId })
  if (module.default.page) sections[serviceId] = module.default.page.sections
}

export const moduleContributions = (module: string): ContributedWindow[] => windows.filter((w) => w.module === module)
export const contributedWindow = (windowId: string): ContributedWindow | undefined => windows.find((w) => w.windowId === windowId && !w.module)
export const windowsOf = (serviceId: string): ContributedWindow[] => windows.filter((w) => w.serviceId === serviceId && !w.module)
export const contributedWidgets = (): readonly ContributedWidget[] => widgets
export const contributedWidget = (type: string): ContributedWidget | undefined => widgets.find((w) => w.type === type)
// The window whose PIN button docks a widget of this type: the window it goes back to.
export const windowPinning = (type: string): string | undefined => windows.find((w) => w.pin === type)?.windowId
export const pageSections = (serviceId: string): readonly ServicePageSection[] => sections[serviceId] ?? []

// Every service, of code or managed, has a page: the window its Services card opens. It shares the
// "<service>:<window>" shape NOX already opens, under a service id that none uses.
const PAGE_PREFIX = 'service:'
export const servicePageId = (serviceId: string): string => `${PAGE_PREFIX}${serviceId}`
export const pageServiceId = (windowId: string): string | undefined => (windowId.startsWith(PAGE_PREFIX) ? windowId.slice(PAGE_PREFIX.length) : undefined)
