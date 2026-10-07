import { defineWebService } from '@meridian/service-sdk/web'
import FeederCameras from './feeder-cameras.svelte'
import FeederWidget from './feeder-widget.svelte'

export default defineWebService({
  windows: [{ id: 'cameras', module: 'cameras', title: 'Cameras', kicker: 'Feeds · linked automation', pin: 'feeder', footer: '1 FEED', component: FeederCameras }],
  widgets: [{ type: 'feeder', title: 'Feeder', kicker: 'AUTOMATION · LIVE', component: FeederWidget }],
})
