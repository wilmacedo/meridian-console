import { defineWebService } from '@meridian/service-sdk/web'
import CalendarWindow from './calendar-window.svelte'
import { footer } from './calendar-state.svelte'

export default defineWebService({
  windows: [{ id: 'calendar', module: 'calendar', title: 'Calendar', kicker: 'Unified · Google', pin: 'cal', footer, component: CalendarWindow }],
})
