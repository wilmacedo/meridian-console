import { defineWebService } from '@meridian/service-sdk/web'
import FeederCameras from './feeder-cameras.svelte'
import { feeder, hopper, watchFeeder } from './feeder-state.svelte'
import { feederTile } from './feeder-tile'
import FeederWidget from './feeder-widget.svelte'

export default defineWebService({
  windows: [{ id: 'cameras', module: 'cameras', title: 'Cameras', kicker: 'Feeds · linked automation', pin: 'feeder', footer: '1 FEED', component: FeederCameras }],
  widgets: [
    {
      type: 'feeder',
      title: 'Feeder',
      kicker: 'AUTOMATION · LIVE',
      component: FeederWidget,
      opens: 'cameras',
      tile: {
        watch: watchFeeder,
        read: () => feederTile({ status: feeder.status, unreachable: feeder.unreachable, dispensing: feeder.phase === 'sending' || feeder.phase === 'waiting', hopper: hopper(feeder.status) }, new Date()),
      },
    },
  ],
})
