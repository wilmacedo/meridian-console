import type { FastifyInstance } from 'fastify'
import { registerFeeder } from './feeder.js'
import { registerFeederCamera } from './feeder-camera.js'

export function registerTuya(app: FastifyInstance): void {
  registerFeederCamera(app)
  registerFeeder(app)
}
