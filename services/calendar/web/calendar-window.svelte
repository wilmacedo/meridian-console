<script lang="ts">
  import { onMount } from 'svelte'
  import CalendarAgenda from './calendar-agenda.svelte'
  import CalendarDetail from './calendar-detail.svelte'
  import CalendarGrid from './calendar-grid.svelte'
  import CalendarSide from './calendar-side.svelte'
  import { cal, eventsIn, trackRange, ui, watchCalendar, weekRange, type View } from './calendar-state.svelte'
  import { addD, isoWeek, monOf, monthGrid, pad, sameD, sod } from './calendar-time'

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const WDL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const VIEWS: View[] = ['day', 'week', 'agenda']
  const NARROW_PX = 620

  let width = $state(0)
  const narrow = $derived(width > 0 && width < NARROW_PX)

  onMount(watchCalendar)

  // Ranges are asked for as plain numbers, so the clock ticking does not make the effects start over.
  const mainFrom = $derived((ui.view === 'day' ? sod(ui.anchor) : monOf(ui.anchor)).getTime())
  const mainTo = $derived(addD(new Date(mainFrom), ui.view === 'day' ? 1 : 7).getTime())
  const month = $derived(monthGrid(ui.anchor, ui.monthOffset).days)
  const monthFrom = $derived(month[0]!.getTime())
  const monthTo = $derived(addD(month.at(-1)!, 1).getTime())
  const nowWeekFrom = $derived(weekRange(cal.now).from.getTime())

  $effect(() => trackRange(new Date(mainFrom), new Date(mainTo)))
  $effect(() => trackRange(new Date(monthFrom), new Date(monthTo)))
  $effect(() => trackRange(new Date(nowWeekFrom), addD(new Date(nowWeekFrom), 7)))

  const events = $derived(eventsIn(new Date(mainFrom), new Date(mainTo)))
  const days = $derived(Array.from({ length: ui.view === 'day' ? 1 : 7 }, (_, i) => addD(new Date(mainFrom), i)))
  const today = $derived(sod(cal.now))
  const selected = $derived(events.find((e) => e.id === ui.selectedId))
  const onToday = $derived(days.some((d) => sameD(d, today)))

  const rangeLabel = $derived.by(() => {
    if (ui.view === 'day') return `${WDL[(ui.anchor.getDay() + 6) % 7]}, ${MON[ui.anchor.getMonth()]} ${ui.anchor.getDate()}`
    const first = new Date(mainFrom)
    const last = addD(first, 6)
    return first.getMonth() === last.getMonth() ? `${MON[first.getMonth()]} ${first.getDate()} – ${last.getDate()}` : `${MON[first.getMonth()]} ${first.getDate()} – ${MON[last.getMonth()]} ${last.getDate()}`
  })
  const rangeKicker = $derived.by(() => {
    if (ui.view === 'day') return `${sameD(ui.anchor, today) ? 'TODAY' : ui.anchor < today ? 'PAST' : 'UPCOMING'} · ${pad(events.length)} EVENTS`
    return `WEEK ${pad(isoWeek(new Date(mainFrom)))} · ${new Date(mainFrom).getFullYear()} · ${pad(events.length)} EVENTS`
  })

  const go = (by: number): void => {
    ui.anchor = addD(ui.anchor, by * (ui.view === 'day' ? 1 : 7))
    ui.monthOffset = 0
    ui.selectedId = null
  }
  const pickView = (v: View): void => {
    ui.view = v
    ui.selectedId = null
  }
  const notice = $derived(
    !cal.loaded ? '' : !cal.configured ? cal.message.toUpperCase() : cal.unreachable ? 'CALENDAR SERVICE UNREACHABLE' : cal.sources.length === 0 ? 'NO CALENDAR CONNECTED · USE CONNECT CALENDAR' : '',
  )
</script>

<div class="shell" class:narrow bind:clientWidth={width}>
  {#if !narrow}
    <CalendarSide {monthFrom} {monthTo} rangeDays={days.map((d) => d.getTime())} />
  {/if}
  <div class="main">
    <div class="bar">
      <div class="range">
        <span class="kicker">{rangeKicker}</span>
        <span class="label">{rangeLabel}</span>
      </div>
      <div class="nav">
        <button class="step" aria-label="Previous" onclick={() => go(-1)}>‹</button>
        <button
          class="today"
          class:here={onToday}
          onclick={() => {
            ui.anchor = today
            ui.monthOffset = 0
            ui.selectedId = null
          }}>TODAY</button
        >
        <button class="step" aria-label="Next" onclick={() => go(1)}>›</button>
      </div>
      <div class="views">
        <span class="thumb" style:left="calc(3px + (100% - 6px) / 3 * {VIEWS.indexOf(ui.view)})"></span>
        {#each VIEWS as v (v)}<button class:on={ui.view === v} onclick={() => pickView(v)}>{v.toUpperCase()}</button>{/each}
      </div>
    </div>

    {#if notice}<div class="notice">{notice}</div>{/if}

    {#if ui.view === 'agenda'}
      <CalendarAgenda {events} />
    {:else}
      <CalendarGrid {days} {events} />
    {/if}

    {#if selected}<CalendarDetail event={selected} />{/if}
  </div>
</div>

<style>
  .shell {
    height: 100%;
    min-height: 420px;
    display: grid;
    grid-template-columns: 214px minmax(0, 1fr);
    gap: 20px;
  }
  .shell.narrow {
    grid-template-columns: minmax(0, 1fr);
  }
  .main {
    position: relative;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: nx-sub 0.5s ease 0.16s both;
  }
  .bar {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }
  .range {
    flex: 1;
    min-width: 150px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .kicker {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(var(--nx-ac), 0.6);
  }
  .label {
    font-family: var(--font-serif);
    font-size: 26px;
    line-height: 1;
    color: rgb(var(--nx-fg));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nav {
    display: flex;
    gap: 4px;
  }
  .step,
  .today {
    height: 30px;
    background: rgba(var(--nx-mu), 0.08);
    border: 1px solid rgba(var(--nx-ac), 0.3);
    border-radius: 8px;
    color: rgb(var(--nx-ac));
    cursor: pointer;
  }
  .step {
    width: 30px;
    padding: 0;
    font-size: 13px;
  }
  .today {
    padding: 0 12px;
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.18em;
  }
  .today:not(.here) {
    border-color: rgba(var(--nx-ac), 0.7);
    color: rgb(var(--nx-fg));
  }
  .step:hover,
  .today:hover {
    background: rgba(var(--nx-mu), 0.22);
    color: rgb(var(--nx-fg));
  }
  .views {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 216px;
    height: 30px;
    padding: 3px;
    box-sizing: border-box;
    border: 1px solid rgba(var(--nx-ac), 0.25);
    border-radius: 9px;
    background: rgba(var(--nx-bg), 0.4);
  }
  .thumb {
    position: absolute;
    top: 3px;
    bottom: 3px;
    width: calc((100% - 6px) / 3);
    border-radius: 6px;
    background: rgba(var(--nx-mu), 0.22);
    border: 1px solid rgba(var(--nx-ac), 0.55);
    box-sizing: border-box;
    box-shadow: 0 0 14px rgba(var(--nx-ac), 0.18);
    transition: left 0.38s cubic-bezier(0.3, 1.3, 0.5, 1);
  }
  .views button {
    position: relative;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgba(var(--nx-ac), 0.6);
    transition: color 0.3s;
  }
  .views button.on {
    color: rgb(var(--nx-fg));
  }
  .notice {
    padding: 8px 12px;
    border: 1px dashed rgba(var(--nx-ac), 0.3);
    border-radius: 8px;
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.18em;
    color: rgba(var(--nx-ac), 0.7);
  }
</style>
