<script lang="ts">
  import { cal, sourceOf, toneOf, ui } from './calendar-state.svelte'
  import { addD, durTxt, hm, pad, relTxt, type CalEvent } from './calendar-time'

  const WDN = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

  let { event }: { event: CalEvent } = $props()

  const day = (d: Date): string => `${WDN[(d.getDay() + 6) % 7]} ${pad(d.getDate())} ${MON[d.getMonth()]}`
  const source = $derived(sourceOf(event.sourceId))
  const t = $derived(toneOf(event.sourceId))

  const rows = $derived.by(() => {
    const out: { k: string; v: string }[] = []
    if (event.allDay) {
      const days = Math.round((event.end.getTime() - event.start.getTime()) / 86_400_000)
      out.push({ k: 'WHEN', v: days > 1 ? `${day(event.start)} – ${day(addD(event.end, -1))}` : `${day(event.start)} · ALL DAY` })
      out.push({ k: 'LENGTH', v: `${days} ${days === 1 ? 'day' : 'days'}` })
    } else {
      out.push({ k: 'WHEN', v: `${day(event.start)} · ${hm(event.start)} – ${hm(event.end)}` })
      out.push({ k: 'LENGTH', v: durTxt(Math.round((event.end.getTime() - event.start.getTime()) / 60_000)) })
    }
    out.push({ k: 'WHERE', v: event.location ?? '—' })
    if (event.alsoIn.length) out.push({ k: 'ALSO IN', v: event.alsoIn.map((id) => sourceOf(id)?.label ?? id).join(', ') })
    return out
  })
</script>

{#key event.id}
  <div class="card">
    <div class="topline"></div>
    <div class="top">
      <span class="swatch" style:background={t.color} style:box-shadow="0 0 8px {t.color}"></span>
      <span class="src">{(source?.label ?? '').toUpperCase()} · {source?.provider ?? 'GOOGLE'}</span>
      <span class="rel">{relTxt(event, cal.now)}</span>
      <button class="x" aria-label="Close" onclick={() => (ui.selectedId = null)}>✕</button>
    </div>
    <span class="title">{event.title || '(sem título)'}</span>
    <div class="kv">
      {#each rows as r (r.k)}
        <div><span class="k">{r.k}</span><span class="v">{r.v}</span></div>
      {/each}
    </div>
    <div class="btns">
      {#if event.joinUrl}<button class="join" onclick={() => window.open(event.joinUrl, '_blank', 'noopener')}>JOIN CALL</button>{/if}
      {#if event.openUrl}<button class="open" onclick={() => window.open(event.openUrl, '_blank', 'noopener')}>OPEN IN {source?.provider ?? 'GOOGLE'} ↗</button>{/if}
    </div>
  </div>
{/key}

<style>
  .card {
    position: absolute;
    right: 12px;
    bottom: 12px;
    z-index: 5;
    width: min(320px, calc(100% - 24px));
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    background: linear-gradient(180deg, rgba(var(--nx-pn), 0.92), rgba(var(--nx-pn), 0.97));
    backdrop-filter: blur(18px) saturate(1.4);
    border: 1px solid rgba(var(--nx-hi), 0.16);
    border-radius: 12px;
    box-shadow:
      0 24px 60px rgba(var(--nx-sh), calc(0.55 * var(--nx-so))),
      inset 0 1px 0 rgba(var(--nx-hi), 0.08);
    animation: nx-in 0.45s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .topline {
    position: absolute;
    left: 16%;
    right: 16%;
    top: 0;
    height: 1px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(var(--nx-ac), 0.9), transparent);
    box-shadow: 0 0 10px rgba(var(--nx-ac), 0.8);
  }
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgba(var(--nx-ac), 0.7);
  }
  .swatch {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 2px;
  }
  .src {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rel {
    color: rgb(var(--nx-fg));
  }
  .x {
    width: 22px;
    height: 22px;
    flex: none;
    padding: 0;
    background: none;
    border: 1px solid rgba(var(--nx-ac), 0.25);
    border-radius: 6px;
    color: rgb(var(--nx-ac));
    font-size: 10px;
    line-height: 1;
    cursor: pointer;
  }
  .x:hover {
    border-color: rgba(var(--nx-ac), 0.7);
    color: rgb(var(--nx-fg));
  }
  .title {
    font-family: var(--font-serif);
    font-size: 26px;
    line-height: 1.05;
    color: rgb(var(--nx-fg));
    text-wrap: balance;
  }
  .kv {
    display: flex;
    flex-direction: column;
  }
  .kv div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
    border-top: 1px solid rgba(var(--nx-ac), 0.1);
    font: 400 11px/1.3 var(--font-mono);
  }
  .k {
    color: rgba(var(--nx-ac), 0.7);
    letter-spacing: 0.06em;
  }
  .v {
    min-width: 0;
    color: rgb(var(--nx-fg));
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .btns {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .btns button {
    height: 30px;
    padding: 0 12px;
    border-radius: 8px;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.16em;
    cursor: pointer;
  }
  .join {
    background: rgba(var(--nx-mu), 0.16);
    border: 1px solid rgba(var(--nx-ac), 0.6);
    color: rgb(var(--nx-fg));
  }
  .join:hover {
    background: rgba(var(--nx-mu), 0.3);
  }
  .open {
    background: rgba(var(--nx-mu), 0.08);
    border: 1px solid rgba(var(--nx-ac), 0.35);
    color: rgb(var(--nx-ac));
  }
  .open:hover {
    background: rgba(var(--nx-mu), 0.22);
    color: rgb(var(--nx-fg));
  }
</style>
