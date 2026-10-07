<script lang="ts">
  import { cal, sourceOf, toneOf, ui } from './calendar-state.svelte'
  import { eventsOn, hm, monOf, pad, sameD, sod, addD, type CalEvent } from './calendar-time'

  const WDN = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

  let { events }: { events: CalEvent[] } = $props()

  const today = $derived(sod(cal.now))
  const blocks = $derived(
    Array.from({ length: 7 }, (_, i) => {
      const day = addD(monOf(ui.anchor), i)
      return { day, label: `${WDN[i]} ${pad(day.getDate())} ${MON[day.getMonth()]}${sameD(day, today) ? ' · TODAY' : ''}`, items: eventsOn(events, day) }
    }),
  )

  const live = (e: CalEvent): boolean => cal.now >= e.start && cal.now < e.end
</script>

<div class="agenda">
  {#each blocks as b, i (b.day.getTime())}
    {@const isToday = sameD(b.day, today)}
    <div class="block" style:animation-delay="{0.1 + i * 0.05}s">
      <div class="bhead">
        <span class="mark" class:today={isToday}></span>
        <span class="blabel" class:today={isToday}>{b.label}</span>
        <span class="rule"></span>
        <span class="bcount">{pad(b.items.length)}</span>
      </div>
      {#if !b.items.length}<span class="empty">Nothing scheduled.</span>{/if}
      {#each b.items as e (e.id)}
        {@const t = toneOf(e.sourceId)}
        <button class="item" class:sel={ui.selectedId === e.id} class:live={live(e)} style:opacity={e.end < cal.now ? 0.5 : 1} onclick={() => (ui.selectedId = ui.selectedId === e.id ? null : e.id)}>
          <span class="time">{e.allDay ? 'ALL DAY' : `${hm(e.start)} – ${hm(e.end)}`}</span>
          <span class="dot" style:background={t.color} style:box-shadow="0 0 8px {t.color}"></span>
          <span class="what"><span class="title">{e.title || '(sem título)'}</span><span class="loc">{e.location ?? '—'}</span></span>
          <span class="tag" class:now={live(e)}>{live(e) ? 'NOW' : (sourceOf(e.sourceId)?.label ?? '').toUpperCase()}</span>
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .agenda {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding-right: 4px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 4px;
    animation: nx-sub 0.45s ease both;
  }
  .bhead {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 4px;
  }
  .mark {
    width: 5px;
    height: 5px;
    flex: none;
    border: 1px solid rgba(var(--nx-ac), 0.6);
    transform: rotate(45deg);
  }
  .mark.today {
    border-color: rgb(var(--nx-fg));
    background: rgb(var(--nx-fg));
  }
  .blabel {
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgb(var(--nx-ac));
  }
  .blabel.today {
    color: rgb(var(--nx-fg));
  }
  .rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(var(--nx-ac), 0.25), transparent);
  }
  .bcount {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: rgba(var(--nx-ac), 0.5);
  }
  .empty {
    padding: 2px 0 0 15px;
    font-size: 12.5px;
    color: rgba(var(--nx-ac), 0.5);
  }
  .item {
    display: grid;
    grid-template-columns: 92px 8px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 9px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 9px;
    text-align: left;
    cursor: pointer;
    transition:
      background 0.2s,
      border-color 0.2s;
  }
  .item:hover {
    background: rgba(var(--nx-mu), 0.08);
  }
  .item.live {
    background: rgba(var(--nx-mu), 0.07);
    border-color: rgba(var(--nx-ac), 0.3);
  }
  .item.sel {
    background: rgba(var(--nx-mu), 0.14);
    border-color: rgba(var(--nx-ac), 0.6);
  }
  .time {
    font: 400 11px/1 var(--font-mono);
    color: rgb(var(--nx-fg));
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .what {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .title {
    font-size: 13.5px;
    font-weight: 500;
    color: rgb(var(--nx-fg));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .loc {
    font-size: 11.5px;
    color: rgba(var(--nx-ac), 0.7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tag {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: rgba(var(--nx-ac), 0.6);
  }
  .tag.now {
    color: rgb(var(--nx-fg));
  }
</style>
