<script lang="ts">
  import { cal, toneOf, ui } from './calendar-state.svelte'
  import { addD, eventsOn, hm, layoutLanes, pad, sameD, sod, type CalEvent } from './calendar-time'

  const WDN = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  // The grid runs 06:00 to midnight, like the design's; an earlier event stays in the agenda and in NOX's answers.
  const H0 = 6
  const H1 = 24
  const HH = 44
  const SPAN = H1 - H0

  let { days, events }: { days: Date[]; events: CalEvent[] } = $props()

  const today = $derived(sod(cal.now))
  const tzOffset = $derived(-cal.now.getTimezoneOffset() / 60)
  const cols = $derived(days.length === 1 ? '52px minmax(0, 1fr)' : '52px repeat(7, minmax(0, 1fr))')
  const hours = Array.from({ length: SPAN - 1 }, (_, i) => ({ label: `${pad(H0 + 1 + i)}:00`, top: ((i + 1) / SPAN) * 100 }))

  const columns = $derived(
    days.map((day) => {
      const dayStart = day.getTime()
      const dayEnd = addD(day, 1).getTime()
      const all = eventsOn(events, day)
      const place = (ms: number) => Math.min(100, Math.max(0, ((ms - dayStart) / 3_600_000 - H0) / SPAN * 100))
      const timed = layoutLanes(all.filter((e) => !e.allDay)).map((e) => {
        const from = Math.max(e.start.getTime(), dayStart)
        const to = Math.min(e.end.getTime(), dayEnd)
        const minutes = (to - from) / 60_000
        return { e, top: place(from), height: (minutes / 60 / SPAN) * 100, minutes }
      })
      return { day, allDay: all.filter((e) => e.allDay), timed, now: sameD(day, today) && cal.now.getHours() >= H0 ? place(cal.now.getTime()) : undefined }
    }),
  )
  const hasAllDay = $derived(columns.some((c) => c.allDay.length))

  // Opens on the working hours instead of the small hours.
  function scrollToNow(el: HTMLElement): void {
    el.scrollTop = Math.max(0, new Date().getHours() - 8) * HH
  }

  const pick = (id: string): void => {
    ui.selectedId = ui.selectedId === id ? null : id
  }
</script>

<div class="grid">
  <div class="heads" style:grid-template-columns={cols}>
    <span class="tz">GMT{tzOffset >= 0 ? '+' : ''}{tzOffset}</span>
    {#each columns as c (c.day.getTime())}
      {@const isToday = sameD(c.day, today)}
      <button
        class="dh"
        class:today={isToday}
        title="Open day"
        onclick={() => {
          ui.view = 'day'
          ui.anchor = c.day
          ui.selectedId = null
        }}
      >
        <span class="dname" class:past={c.day < today}>{WDN[(c.day.getDay() + 6) % 7]}</span>
        <span class="dnum" class:past={c.day < today}>{pad(c.day.getDate())}{#if isToday}<i></i>{/if}</span>
      </button>
    {/each}
  </div>

  {#if hasAllDay}
    <div class="strip" style:grid-template-columns={cols}>
      <span class="stag">ALL DAY</span>
      {#each columns as c (c.day.getTime())}
        <div class="scell">
          {#each c.allDay as e (e.id)}
            {@const t = toneOf(e.sourceId)}
            <button class="chip" class:sel={ui.selectedId === e.id} style:background={t.fill} style:border-color={ui.selectedId === e.id ? 'rgb(var(--nx-fg))' : t.line} onclick={() => pick(e.id)}>
              <span>{e.title || '(sem título)'}</span>
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  <div class="scroll" use:scrollToNow>
    <div class="body" style:grid-template-columns={cols} style:height="{SPAN * HH}px">
      <div class="hours">
        {#each hours as h (h.label)}<span style:top="{h.top}%">{h.label}</span>{/each}
      </div>
      {#each columns as c (c.day.getTime())}
        <div class="col" class:today={sameD(c.day, today)}>
          {#each c.timed as { e, top, height, minutes } (e.id)}
            {@const t = toneOf(e.sourceId)}
            {@const sel = ui.selectedId === e.id}
            <button
              class="ev"
              class:sel
              style:top="{top}%"
              style:height="max(20px, {height}%)"
              style:left="calc({(e.lane / e.lanes) * 100}% + 3px)"
              style:width="calc({100 / e.lanes}% - 6px)"
              style:background={t.fill}
              style:border-color={sel ? 'rgb(var(--nx-fg))' : t.line}
              style:opacity={e.end < cal.now ? 0.5 : 1}
              style:box-shadow={sel ? `0 0 0 1px rgb(var(--nx-fg)), 0 0 18px ${t.line}` : 'none'}
              onclick={() => pick(e.id)}
            >
              <span class="etitle">{e.title || '(sem título)'}</span>
              {#if minutes >= 40}<span class="etime">{hm(e.start)} – {hm(e.end)}</span>{/if}
            </button>
          {/each}
          {#if c.now !== undefined}
            <div class="now" style:top="{c.now}%"><span></span></div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .grid {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(var(--nx-ac), 0.14);
    border-radius: 12px;
    overflow: hidden;
    background: rgba(var(--nx-bg), 0.22);
  }
  .heads,
  .strip {
    display: grid;
    border-bottom: 1px solid rgba(var(--nx-ac), 0.14);
    background: rgba(var(--nx-mu), 0.05);
  }
  .tz {
    align-self: end;
    padding: 0 0 9px 9px;
    font: 400 8px/1 var(--font-mono);
    letter-spacing: 0.1em;
    color: rgba(var(--nx-ac), 0.4);
  }
  .dh {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-width: 0;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-left: 1px solid rgba(var(--nx-ac), 0.1);
    text-align: left;
    cursor: pointer;
  }
  .dh.today {
    background: rgba(var(--nx-mu), 0.08);
  }
  .dh:hover {
    background: rgba(var(--nx-mu), 0.1);
  }
  .dname {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgba(var(--nx-ac), 0.55);
  }
  .dnum {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 18px;
    font-weight: 500;
    line-height: 1;
    color: rgb(var(--nx-ac));
  }
  .dnum.past {
    color: rgba(var(--nx-ac), 0.5);
  }
  .dh.today .dname,
  .dh.today .dnum {
    color: rgb(var(--nx-fg));
  }
  .dnum i {
    width: 5px;
    height: 5px;
    background: rgb(var(--nx-fg));
    transform: rotate(45deg);
    box-shadow: 0 0 8px rgb(var(--nx-ac));
  }
  .stag {
    align-self: start;
    padding: 8px 0 0 9px;
    font: 400 7.5px/1 var(--font-mono);
    letter-spacing: 0.08em;
    color: rgba(var(--nx-ac), 0.4);
  }
  .scell {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 4px 3px;
    border-left: 1px solid rgba(var(--nx-ac), 0.1);
  }
  .chip {
    height: 20px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    padding: 0 6px;
    min-width: 0;
    border: 1px solid;
    border-radius: 6px;
    text-align: left;
    color: rgb(var(--nx-fg));
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    transition:
      border-color 0.2s,
      transform 0.2s;
  }
  .chip span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chip:hover {
    transform: translateY(-1px);
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .body {
    position: relative;
    display: grid;
  }
  .hours {
    position: relative;
  }
  .hours span {
    position: absolute;
    right: 9px;
    transform: translateY(-50%);
    font: 400 9px/1 var(--font-mono);
    color: rgba(var(--nx-ac), 0.45);
  }
  .col {
    position: relative;
    min-width: 0;
    border-left: 1px solid rgba(var(--nx-ac), 0.1);
    background-image: repeating-linear-gradient(to bottom, rgba(var(--nx-ac), 0.08) 0 1px, transparent 1px 44px);
  }
  .col.today {
    background-color: rgba(var(--nx-mu), 0.05);
  }
  .ev {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 4px 6px;
    overflow: hidden;
    border: 1px solid;
    border-radius: 6px;
    text-align: left;
    cursor: pointer;
    backdrop-filter: blur(6px);
    transition:
      box-shadow 0.2s,
      transform 0.2s,
      border-color 0.2s;
    animation: nx-sub 0.45s ease both;
  }
  .ev:hover {
    transform: translateY(-1px);
  }
  .etitle {
    max-width: 100%;
    font-size: 11.5px;
    font-weight: 500;
    line-height: 1.2;
    color: rgb(var(--nx-fg));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .etime {
    max-width: 100%;
    font: 400 9px/1 var(--font-mono);
    color: rgba(var(--nx-ac), 0.8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .now {
    position: absolute;
    left: -1px;
    right: 0;
    height: 1px;
    z-index: 2;
    pointer-events: none;
    background: rgb(var(--nx-fg));
    box-shadow: 0 0 8px rgb(var(--nx-ac));
  }
  .now span {
    position: absolute;
    left: -3px;
    top: -3px;
    width: 7px;
    height: 7px;
    background: rgb(var(--nx-fg));
    transform: rotate(45deg);
  }
</style>
