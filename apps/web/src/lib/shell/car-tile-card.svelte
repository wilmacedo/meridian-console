<script lang="ts">
  import type { WidgetTone } from '@meridian/service-sdk/web'
  import { dock } from '../dock/dock.svelte'
  import { eventsView } from '../live/events-view.svelte'
  import { live } from '../live/stream.svelte'
  import { contributedWidget } from '../services/service-ui'
  import { open } from '../windows/window-manager.svelte'
  import { visibleServices } from '../workspace/prefs.svelte'
  import { BUILT_IN_WINDOW, carTile } from './car-tile'

  // A low screen (a phone turned sideways) gets tighter tiles, so a row of 84px still holds all of one.
  let { id, index, compact = false }: { id: string; index: number; compact?: boolean } = $props()

  const COLORS: Record<WidgetTone, string> = { ok: 'rgb(var(--nx-ac))', warn: '#ffd34d', bad: '#ff6b8a' }

  const def = $derived(dock.widgets[id].def)
  const own = $derived(contributedWidget(def.type))
  // Whatever feeds a service's tile is started while the tile is on screen.
  $effect(() => own?.tile?.watch?.())
  const tile = $derived(carTile(def, { sample: live.telemetry.at(-1), services: visibleServices(), events: live.events }, own?.tile?.read))
  const dot = $derived(tile.accent ?? COLORS[tile.tone ?? 'ok'])
  const sub = $derived(tile.subTone && tile.subTone !== 'dim' ? COLORS[tile.subTone] : 'rgba(var(--nx-ac), 0.8)')

  function openIt(): void {
    const target = BUILT_IN_WINDOW[def.type] ?? own?.opens
    if (!target) return
    if (def.type === 'logs') eventsView.filter = def.svc ?? 'all'
    open(target)
  }
</script>

<button class="tile" class:compact style:animation-delay="{index * 0.06}s" onclick={openIt}>
  <i class="edge"></i>
  <span class="kicker"><span class="dot" style:background={dot} style:box-shadow="0 0 8px {dot}"></span><span class="text">{tile.kicker}</span><span class="more">›</span></span>
  <span class="value" class:text={tile.valueSize === 'text'}><span class="v">{tile.value}</span>{#if tile.unit}<span class="unit">{tile.unit}</span>{/if}</span>
  <span class="foot">
    {#if tile.sub}<span class="sub" style:color={sub}>{tile.sub}</span>{/if}
    {#if tile.bar}
      {@const bar = tile.bar.tone ? COLORS[tile.bar.tone] : (tile.accent ?? COLORS.ok)}
      <span class="track"><span class="fill" style:width="{Math.min(100, Math.max(0, tile.bar.value))}%" style:background={bar} style:box-shadow="0 0 8px {bar}"></span></span>
    {/if}
  </span>
</button>

<style>
  .tile {
    position: relative;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 6px;
    padding: 12px 15px 13px;
    text-align: left;
    font: inherit;
    color: inherit;
    background: linear-gradient(180deg, rgba(var(--nx-pn), 0.86), rgba(var(--nx-pn), 0.93));
    backdrop-filter: blur(16px) saturate(1.3);
    -webkit-backdrop-filter: blur(16px) saturate(1.3);
    border: 1px solid rgba(var(--nx-hi), 0.1);
    border-radius: 14px;
    overflow: hidden;
    cursor: pointer;
    touch-action: manipulation;
    box-shadow:
      0 18px 40px rgba(var(--nx-sh), calc(0.45 * var(--nx-so))),
      inset 0 1px 0 rgba(var(--nx-hi), 0.06);
    animation: nx-in 0.55s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    transition:
      transform 0.15s ease,
      border-color 0.2s;
  }
  .tile.compact {
    gap: 3px;
    padding: 8px 12px 9px;
  }
  .compact .v {
    font-size: 25px;
  }
  .compact .value.text .v {
    font-size: 18px;
  }
  .compact .foot {
    gap: 5px;
  }
  .compact .sub {
    font-size: 12px;
  }
  .tile:active {
    transform: scale(0.97);
    border-color: rgba(var(--nx-ac), 0.55);
  }
  .edge {
    position: absolute;
    left: 18%;
    right: 18%;
    top: 0;
    height: 1px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(var(--nx-ac), 0.7), transparent);
  }
  .kicker {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font: 400 11px/1 var(--font-mono);
    letter-spacing: 0.18em;
    color: rgba(var(--nx-ac), 0.8);
  }
  .dot {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
  }
  .text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .more {
    flex: none;
    font-size: 14px;
    line-height: 1;
    opacity: 0.55;
  }
  .value {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .v {
    min-width: 0;
    font-size: 30px;
    font-weight: 500;
    line-height: 1.05;
    letter-spacing: -0.01em;
    color: rgb(var(--nx-fg));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .value.text .v {
    font-size: 21px;
  }
  .unit {
    flex: none;
    font: 400 11px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: rgba(var(--nx-ac), 0.7);
  }
  .foot {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .sub {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .track {
    position: relative;
    display: block;
    height: 4px;
    border-radius: 2px;
    background: rgba(var(--nx-mu), 0.22);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 2px;
    transition: width 0.8s ease;
  }
</style>
