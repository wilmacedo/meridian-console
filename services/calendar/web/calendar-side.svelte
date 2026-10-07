<script lang="ts">
  import { cal, eventsIn, signIn, toggleSource, ui, type SourceInfo } from './calendar-state.svelte'
  import { eventsOn, monthGrid, sameD, sod, tone } from './calendar-time'

  const MONF = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

  let { monthFrom, monthTo, rangeDays }: { monthFrom: number; monthTo: number; rangeDays: number[] } = $props()

  const grid = $derived(monthGrid(ui.anchor, ui.monthOffset))
  const monthEvents = $derived(eventsIn(new Date(monthFrom), new Date(monthTo)))
  const today = $derived(sod(cal.now))
  const shown = $derived(cal.sources.filter((s) => s.visible).length)

  function cell(day: Date) {
    const inMonth = day.getMonth() === grid.base.getMonth()
    const isToday = sameD(day, today)
    const inRange = rangeDays.includes(day.getTime())
    return { inMonth, isToday, inRange, has: eventsOn(monthEvents, day).length > 0 }
  }

  function status(s: SourceInfo): { label: string; syncing: boolean; warn: boolean } {
    if (s.status === 'pending') return { label: 'PENDING', syncing: false, warn: true }
    if (!s.visible) return { label: 'HIDDEN', syncing: false, warn: false }
    return cal.fetching > 0 ? { label: 'SYNCING', syncing: true, warn: false } : { label: 'SYNCED', syncing: false, warn: false }
  }

  const open = (s: SourceInfo): Promise<void> | void => (s.status === 'pending' ? signIn(s.accountId) : toggleSource(s.id))
  const step = (by: number): void => {
    ui.monthOffset += by
  }
</script>

<aside class="side">
  <div class="month">
    <div class="mhead">
      <span class="mlabel">{MONF[grid.base.getMonth()]} {grid.base.getFullYear()}</span>
      <button class="nav" aria-label="Previous month" onclick={() => step(-1)}>‹</button>
      <button class="nav" aria-label="Next month" onclick={() => step(1)}>›</button>
    </div>
    <div class="cells">
      {#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as l, i (i)}<span class="wd">{l}</span>{/each}
      {#each grid.days as day (day.getTime())}
        {@const c = cell(day)}
        <button
          class="day"
          class:today={c.isToday}
          class:range={c.inRange && !c.isToday}
          class:out={!c.inMonth}
          onclick={() => {
            ui.anchor = sod(day)
            ui.monthOffset = 0
            ui.selectedId = null
          }}
        >
          {day.getDate()}<i style:opacity={c.has ? (c.inMonth ? 0.8 : 0.3) : 0}></i>
        </button>
      {/each}
    </div>
  </div>

  <div class="sources">
    <div class="shead">
      <span class="diamond"></span><span class="slabel">SOURCES</span><span class="rule"></span>
      <span class="count">{shown}/{cal.sources.length}</span>
    </div>
    <div class="list">
      {#each cal.sources as s, i (s.id)}
        {@const t = tone(s.hue)}
        {@const st = status(s)}
        <button class="source" class:off={!s.visible} style:animation-delay="{0.14 + i * 0.05}s" title={s.status === 'pending' ? 'Sign in again' : 'Show / hide'} onclick={() => open(s)}>
          <span class="swatch" style:border-color={t.color} style:background={s.visible ? t.color : 'transparent'} style:box-shadow={s.visible ? `0 0 8px ${t.line}` : 'none'}></span>
          <span class="names"><span class="name">{s.label}</span><span class="sub">{s.provider} · {s.account}</span></span>
          <span class="status" class:warn={st.warn} class:syncing={st.syncing}><i></i>{st.label}</span>
        </button>
      {:else}
        <span class="none">{cal.configured ? 'No calendar connected yet.' : 'Calendar is not set up.'}</span>
      {/each}
    </div>
    <button class="connect" onclick={() => signIn()}><span>+</span>CONNECT CALENDAR</button>
  </div>
</aside>

<style>
  .side {
    display: flex;
    flex-direction: column;
    gap: 22px;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
    animation: nx-sub 0.5s ease 0.1s both;
  }
  .month,
  .sources {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .sources {
    gap: 8px;
  }
  .mhead {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .mlabel {
    flex: 1;
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgb(var(--nx-ac));
  }
  .nav {
    width: 22px;
    height: 22px;
    padding: 0;
    background: none;
    border: 1px solid rgba(var(--nx-ac), 0.25);
    border-radius: 6px;
    color: rgb(var(--nx-ac));
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
  }
  .nav:hover {
    border-color: rgba(var(--nx-ac), 0.7);
    color: rgb(var(--nx-fg));
  }
  .cells {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 2px;
  }
  .wd {
    text-align: center;
    padding-bottom: 4px;
    font: 400 8.5px/1 var(--font-mono);
    letter-spacing: 0.1em;
    color: rgba(var(--nx-ac), 0.45);
  }
  .day {
    position: relative;
    height: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: rgb(var(--nx-fg));
    font: 400 10.5px/1 var(--font-mono);
    cursor: pointer;
    transition:
      background 0.2s,
      border-color 0.2s;
  }
  .day:hover {
    border-color: rgba(var(--nx-ac), 0.5);
  }
  .day.out {
    color: rgba(var(--nx-ac), 0.3);
  }
  .day.range {
    background: rgba(var(--nx-mu), 0.16);
    border-color: rgba(var(--nx-ac), 0.22);
  }
  .day.today {
    background: rgb(var(--nx-ac));
    color: rgb(var(--nx-pn));
    font-weight: 600;
  }
  .day i {
    position: absolute;
    left: 50%;
    bottom: 3px;
    width: 3px;
    height: 3px;
    margin-left: -1.5px;
    border-radius: 50%;
    background: rgb(var(--nx-ac));
  }
  .day.today i {
    background: rgb(var(--nx-pn));
  }
  .shead {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .diamond {
    width: 5px;
    height: 5px;
    flex: none;
    border: 1px solid rgba(var(--nx-ac), 0.8);
    transform: rotate(45deg);
  }
  .slabel {
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgb(var(--nx-ac));
  }
  .rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(var(--nx-ac), 0.3), transparent);
  }
  .count {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: rgba(var(--nx-ac), 0.55);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .source {
    display: grid;
    grid-template-columns: 12px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 7px 8px;
    margin: 0 -8px;
    background: none;
    border: none;
    border-radius: 8px;
    text-align: left;
    cursor: pointer;
    transition:
      opacity 0.25s,
      background 0.2s;
    animation: nx-sub 0.45s ease both;
  }
  .source:hover {
    background: rgba(var(--nx-mu), 0.08);
  }
  .source.off {
    opacity: 0.5;
  }
  .swatch {
    width: 10px;
    height: 10px;
    box-sizing: border-box;
    border-radius: 3px;
    border: 1.5px solid;
    transition:
      background 0.25s,
      box-shadow 0.25s;
  }
  .names {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .name {
    font-size: 13px;
    font-weight: 500;
    color: rgb(var(--nx-fg));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    font: 400 9px/1.2 var(--font-mono);
    letter-spacing: 0.06em;
    color: rgba(var(--nx-ac), 0.55);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 5px;
    font: 400 8.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: rgba(var(--nx-ac), 0.55);
  }
  .status i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
  }
  .status.syncing {
    color: rgb(var(--nx-fg));
  }
  .status.syncing i {
    animation: nx-blink 0.8s ease-in-out infinite;
  }
  .status.warn {
    color: rgb(var(--nx-wn));
  }
  .none {
    padding: 4px 0;
    font-size: 12px;
    color: rgba(var(--nx-ac), 0.5);
  }
  .connect {
    width: 100%;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    background: none;
    border: 1px dashed rgba(var(--nx-ac), 0.3);
    border-radius: 8px;
    color: rgb(var(--nx-ac));
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.2em;
    cursor: pointer;
    transition:
      border-color 0.2s,
      color 0.2s;
  }
  .connect:hover {
    border-color: rgba(var(--nx-ac), 0.7);
    color: rgb(var(--nx-fg));
  }
  .connect span {
    font-size: 13px;
    line-height: 1;
  }
</style>
