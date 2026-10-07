<script lang="ts">
  import { onMount } from 'svelte'
  import { cal, eventsIn, toneOf, trackRange, watchCalendar } from './calendar-state.svelte'
  import { addD, eventsOn, hm, relTxt, sod } from './calendar-time'

  // The strip covers 07:00 to 23:00, as in the design.
  const S0 = 7
  const SPAN = 16

  onMount(watchCalendar)

  const dayFrom = $derived(sod(cal.now).getTime())
  $effect(() => trackRange(new Date(dayFrom), addD(new Date(dayFrom), 2)))

  const today = $derived(sod(cal.now))
  const tomorrow = $derived(addD(today, 1))
  const all = $derived(eventsIn(today, addD(today, 2)))
  const timed = $derived(eventsOn(all, today).filter((e) => !e.allDay))
  const current = $derived(timed.find((e) => e.start <= cal.now && e.end > cal.now))
  const next = $derived(timed.find((e) => e.start > cal.now))
  const head = $derived(current ?? next)
  const rest = $derived(timed.filter((e) => e.end > cal.now && e !== head).slice(0, 4))
  const nextDay = $derived(eventsOn(all, tomorrow).find((e) => !e.allDay))

  const place = (d: Date): number => Math.max(0, Math.min(100, ((d.getHours() + d.getMinutes() / 60 - S0) / SPAN) * 100))
  const progress = $derived(current ? ((cal.now.getTime() - current.start.getTime()) / (current.end.getTime() - current.start.getTime())) * 100 : 0)
</script>

<div class="body">
  {#if head}
    {@const t = toneOf(head.sourceId)}
    <div class="top">
      <span class="dot" class:pulse={!!current} style:background={t.color}></span>
      <span class="kick">{current ? 'NOW' : 'NEXT'}</span>
      <span class="in">{current ? `${Math.max(1, Math.round((current.end.getTime() - cal.now.getTime()) / 60_000))}M LEFT` : relTxt(head, cal.now)}</span>
    </div>
    <div class="title">{head.title || '(sem título)'}</div>
    <div class="meta">{hm(head.start)} – {hm(head.end)}{head.location ? ` · ${head.location}` : ''}</div>
    {#if current}<div class="bar"><i style:width="{progress}%"></i></div>{/if}
  {:else}
    <div class="none">Clear for the rest of today.{nextDay ? ` Tomorrow opens at ${hm(nextDay.start)} with ${nextDay.title || '(sem título)'}.` : ''}</div>
  {/if}

  <div class="strip">
    {#each timed as e (e.id)}
      <i class="seg" style:left="{place(e.start)}%" style:width="max(0.8%, {place(e.end) - place(e.start)}%)" style:background={toneOf(e.sourceId).color} style:opacity={e.end < cal.now ? 0.3 : 0.9}></i>
    {/each}
    <i class="nowmark" style:left="{place(cal.now)}%"></i>
  </div>

  {#each rest as e (e.id)}
    <div class="row">
      <span class="rtime">{hm(e.start)}</span>
      <span class="rdot" style:background={toneOf(e.sourceId).color}></span>
      <span class="rtitle">{e.title || '(sem título)'}</span>
    </div>
  {/each}
</div>

<style>
  .body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .dot.pulse {
    animation: nx-blink 1.4s ease-in-out infinite;
  }
  .kick {
    color: rgb(var(--nx-fg));
  }
  .in {
    margin-left: auto;
    color: rgba(var(--nx-ac), 0.7);
  }
  .title {
    font-size: 14px;
    font-weight: 500;
    color: rgb(var(--nx-fg));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font: 400 10px/1.2 var(--font-mono);
    color: rgba(var(--nx-ac), 0.7);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar {
    height: 3px;
    border-radius: 2px;
    background: rgba(var(--nx-mu), 0.22);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: rgb(var(--nx-ac));
  }
  .none {
    font-size: 12px;
    line-height: 1.4;
    color: rgba(var(--nx-ac), 0.7);
  }
  .strip {
    position: relative;
    height: 8px;
    border-radius: 2px;
    background: rgba(var(--nx-mu), 0.12);
  }
  .seg {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 1px;
  }
  .nowmark {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 1px;
    background: rgb(var(--nx-fg));
    box-shadow: 0 0 6px rgb(var(--nx-ac));
  }
  .row {
    display: grid;
    grid-template-columns: 38px 6px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    font: 400 11px/1.2 var(--font-mono);
  }
  .rtime {
    color: rgba(var(--nx-ac), 0.7);
  }
  .rdot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .rtitle {
    color: rgb(var(--nx-fg));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
