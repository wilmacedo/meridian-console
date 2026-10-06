import { defineWebService } from '@meridian/service-sdk/web'
import FeederCamera from './feeder-camera.svelte'
import FeederPanel from './feeder-panel.svelte'

export default defineWebService({ habitat: [FeederCamera, FeederPanel] })
