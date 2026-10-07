import { defineWebService } from '@meridian/service-sdk/web'
import PacketConsole from './packet-console.svelte'

export default defineWebService({
  windows: [{ id: 'console', title: 'Packets', kicker: 'Live packet stream', component: PacketConsole }],
})
