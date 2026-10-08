import { defineWebService } from '@meridian/service-sdk/web'
import CalendarWidget from './calendar-widget.svelte'
import CalendarWindow from './calendar-window.svelte'
import { calendarTile } from './calendar-tile'
import { cal, footer, todayTimed, watchToday } from './calendar-state.svelte'

export default defineWebService({
  windows: [{ id: 'calendar', module: 'calendar', title: 'Calendar', kicker: 'Unified · Google', pin: 'cal', footer, component: CalendarWindow }],
  widgets: [
    {
      type: 'cal',
      title: 'Today',
      kicker: 'CALENDAR · LIVE',
      component: CalendarWidget,
      opens: 'calendar',
      tile: { watch: watchToday, read: () => calendarTile(todayTimed(), cal.now) },
    },
  ],
})
