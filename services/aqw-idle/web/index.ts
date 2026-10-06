import { defineWebService } from '@meridian/service-sdk/web'
import PacketConsole from './packet-console.svelte'

export default defineWebService({ panel: PacketConsole })
