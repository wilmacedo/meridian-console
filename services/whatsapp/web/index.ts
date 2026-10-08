import { defineWebService } from '@meridian/service-sdk/web'
import WhatsappWindow from './whatsapp-window.svelte'

export default defineWebService({
  windows: [{ id: 'whatsapp', title: 'WhatsApp', kicker: 'Linked device', component: WhatsappWindow }],
})
