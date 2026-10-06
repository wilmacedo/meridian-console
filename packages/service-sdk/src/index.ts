export type ServiceState = 'ok' | 'warn' | 'err'

export interface ServiceManifest {
  // Kebab-case and unique. Must match the service's folder name; it is also the API prefix,
  // /api/services/<id>.
  id: string
  name: string
  // Free-form category shown as a chip, e.g. "packet-stream" or "home-device". Nothing branches on it.
  kind: string
  // Short badge text in the services list.
  tag: string
  // Services with the same host are grouped together. Defaults to "local".
  host?: string
  description?: string
}

export interface ServiceFact {
  label: string
  value: string
}

export interface ServiceStatus {
  state: ServiceState
  message?: string
  facts?: ServiceFact[]
}

// What GET /api/services returns for each service.
export interface ServiceSummary extends ServiceManifest {
  host: string
  status: ServiceStatus
}
