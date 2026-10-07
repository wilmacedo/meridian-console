<script lang="ts">
  import { flip } from 'svelte/animate'
  import { pointerDrag } from '../windows/pointer-drag'
  import { dock, setRailEl } from './dock.svelte'
  import type { RailId } from './widgets'
  import WidgetCard from './widget-card.svelte'
  import { STRIP_H } from './stage-insets'
  import { isStacked } from '../workspace/layout.svelte'

  let { rail }: { rail: RailId } = $props()

  const pad = (n: number): string => String(n).padStart(2, '0')
  const left = $derived(rail === 'L')
  const stacked = $derived(isStacked())
  const ids = $derived(dock.rails[rail])
  const visible = $derived(ids.length > 0 || dock.drag !== null || dock.pending !== null)
  const targeted = $derived(dock.drag?.rail === rail)
  const hot = $derived(targeted && !dock.drag?.landing)

  // The dragged widget leaves the list, and a slot marks where it would land (or, while a pin is
  // pending, where it could).
  type Item = { kind: 'widget' | 'slot'; id: string }
  const items = $derived.by(() => {
    const d = dock.drag
    const list: Item[] = ids.filter((id) => id !== d?.id).map((id) => ({ kind: 'widget', id }))
    if (d || dock.pending) list.splice(targeted && d ? Math.min(d.index, list.length) : list.length, 0, { kind: 'slot', id: `slot-${rail}` })
    return list
  })
  const slotHeight = $derived(targeted && dock.drag ? Math.max(64, Math.min(dock.drag.h, 320)) : 52)
  // In a strip the slot is a card-wide gap instead of a card-high one.
  const slotWidth = $derived(targeted && dock.drag ? dock.drag.w : 260)

  // cubic-bezier(.2,.8,.2,1), the design's easing for reflow.
  const ease = (t: number): number => {
    const [x1, y1, x2, y2] = [0.2, 0.8, 0.2, 1]
    const bez = (a: number, b: number, s: number): number => 3 * a * (1 - s) ** 2 * s + 3 * b * (1 - s) * s ** 2 + s ** 3
    let lo = 0
    let hi = 1
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      if (bez(x1, x2, mid) < t) lo = mid
      else hi = mid
    }
    return bez(y1, y2, (lo + hi) / 2)
  }

  let list: HTMLElement
  let content: HTMLElement
  let bar = $state({ on: false, scrolls: false, top: 0, height: 100, atTop: true, atEnd: true, ticks: [] as number[] })

  function measure(): void {
    const sh = stacked ? list.scrollWidth : list.scrollHeight
    const ch = stacked ? list.clientWidth : list.clientHeight
    const st = stacked ? list.scrollLeft : list.scrollTop
    const on = sh > ch + 2
    bar = {
      on: on && !stacked,
      scrolls: on,
      top: on ? (st / sh) * 100 : 0,
      height: on ? (ch / sh) * 100 : 100,
      atTop: st < 2,
      atEnd: st + ch >= sh - 2,
      ticks: on && !stacked ? [...list.querySelectorAll<HTMLElement>('[data-wid]')].slice(1).map((n) => ((n.offsetTop - 5) / sh) * 100) : [],
    }
  }

  // A mouse wheel only turns vertically; a strip scrolls sideways.
  function wheel(e: WheelEvent): void {
    if (!stacked || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    list.scrollLeft += e.deltaY
    e.preventDefault()
  }

  $effect(() => {
    setRailEl(rail, list)
    const ro = new ResizeObserver(measure)
    ro.observe(list)
    ro.observe(content)
    measure()
    void stacked
    return () => {
      ro.disconnect()
      setRailEl(rail, undefined)
    }
  })

  let thumbStart = 0
  const thumb = {
    onPress: () => (thumbStart = list.scrollTop),
    onMove: (_dx: number, dy: number) => (list.scrollTop = thumbStart + dy * (list.scrollHeight / list.clientHeight)),
    onEnd: () => {},
  }

  const edge = $derived(stacked ? 'to right' : 'to bottom')
  const mask = $derived(bar.scrolls ? `linear-gradient(${edge}, ${bar.atTop ? '#000' : 'transparent'} 0, #000 26px, #000 calc(100% - 26px), ${bar.atEnd ? '#000' : 'transparent'} 100%)` : 'none')
</script>

<div class="rail" class:left class:right={!left} class:stacked class:visible style:--strip-h={STRIP_H}>
  <div class="head">
    <span class="label"><i></i>DOCK·{rail}</span>
    <span class="rule"></span>
    <span class="count">{pad(ids.length)}</span>
  </div>
  <div class="well">
    <div class="hot" class:on={hot}></div>
    <div class="list" bind:this={list} data-rail={rail} onscroll={measure} onwheel={wheel} style:mask-image={mask} style:-webkit-mask-image={mask}>
      <div class="content" bind:this={content}>
        {#each items as it, i (it.id)}
          {@const w = it.kind === 'widget' ? dock.widgets[it.id] : null}
          <div
            class="item"
            class:slot={!w}
            class:targeted={!w && targeted}
            class:closing={w?.closing}
            class:landed={w?.landed}
            data-wid={w ? it.id : undefined}
            data-slot={w ? undefined : it.id}
            style:height={w || stacked ? undefined : `${slotHeight}px`}
            style:width={w || !stacked ? undefined : `${slotWidth}px`}
            style:--h="{w?.exitHeight ?? 0}px"
            style:--dx="{w?.exitDx ?? 0}px"
            animate:flip={{ duration: 300, easing: ease }}
          >
            {#if w}<WidgetCard widget={w} slot="{rail}·{pad(i + 1)}" />{:else}SLOT {rail}·{pad(i + 1)}{/if}
          </div>
        {/each}
      </div>
    </div>
    {#if bar.on}
      <div class="track" class:track-left={left} class:track-right={!left}>
        <div class="spine"></div>
        <div class="cap top"></div>
        <div class="cap bottom"></div>
        {#each bar.ticks as t}<div class="tick" style:top="{t}%"></div>{/each}
        <div class="thumb" style:top="{bar.top}%" style:height="{bar.height}%" use:pointerDrag={thumb}></div>
      </div>
    {/if}
  </div>
</div>

<style>
  .rail {
    position: absolute;
    top: 112px;
    bottom: 116px;
    width: min(300px, 24vw);
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 10px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.35s ease;
  }
  .rail.visible {
    opacity: 1;
    pointer-events: auto;
  }
  .left {
    left: 26px;
  }
  .right {
    right: 26px;
  }
  /* Stacked layout: L is the strip above the stage, R the one below it. */
  .rail.stacked {
    left: 26px;
    right: 26px;
    width: auto;
    height: var(--strip-h);
  }
  .rail.stacked.left {
    top: 112px;
    bottom: auto;
  }
  .rail.stacked.right {
    top: auto;
    bottom: 116px;
  }
  .stacked.right .head {
    flex-direction: row;
  }
  .stacked.right .rule {
    background: linear-gradient(90deg, rgba(var(--nx-ac), 0.3), transparent);
  }
  .stacked .list {
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 0;
  }
  .stacked .content {
    flex-direction: row;
    height: 100%;
    align-items: flex-start;
  }
  .stacked .item {
    width: min(300px, 24vw);
    max-height: 100%;
  }
  .stacked .item.slot {
    height: 100%;
  }
  /* A card taller than the strip fits it and scrolls inside, instead of being cut at the strip's edge. */
  .stacked .item :global(.card) {
    max-height: 100%;
    display: flex;
    flex-direction: column;
  }
  .stacked .item :global(.rows) {
    flex: 1;
    min-height: 0;
  }
  .stacked .item :global(.clip) {
    overflow-y: auto;
    scrollbar-width: none;
  }
  .stacked .hot {
    inset: -8px -8px -8px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(var(--nx-ac), 0.55);
  }
  .right .head {
    flex-direction: row-reverse;
  }
  .label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .label i {
    width: 4px;
    height: 4px;
    border: 1px solid rgba(var(--nx-ac), 0.7);
    transform: rotate(45deg);
  }
  .rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(var(--nx-ac), 0.3), transparent);
  }
  .right .rule {
    background: linear-gradient(270deg, rgba(var(--nx-ac), 0.3), transparent);
  }
  .count {
    color: rgba(var(--nx-ac), 0.8);
  }
  .well {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .hot {
    position: absolute;
    inset: -8px -8px 10px;
    border-radius: 16px;
    pointer-events: none;
    background: rgba(var(--nx-mu), 0.07);
    box-shadow:
      inset 0 0 0 1px rgba(var(--nx-ac), 0.2),
      0 0 40px rgba(var(--nx-ac), 0.08);
    opacity: 0;
    transition: opacity 0.25s ease;
  }
  .hot.on {
    opacity: 1;
  }
  .list {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    padding-bottom: 18px;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .item {
    flex: none;
    animation: nx-in 0.55s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .item.slot {
    display: grid;
    place-items: center;
    border: 1px dashed rgba(var(--nx-ac), 0.22);
    border-radius: 12px;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.22em;
    color: rgba(var(--nx-ac), 0.4);
    animation:
      nx-slot-in 0.3s ease both,
      nx-slot-pulse 1.6s ease-in-out infinite;
    transition:
      height 0.2s ease,
      border-color 0.2s;
  }
  .item.slot.targeted {
    border-color: rgba(var(--nx-ac), 0.75);
    background: rgba(var(--nx-mu), 0.12);
    color: rgb(var(--nx-ac));
  }
  .item.landed {
    animation: nx-land 0.45s var(--ease-out) both;
  }
  .item.closing {
    overflow: hidden;
    pointer-events: none;
    animation: nx-out 0.55s cubic-bezier(0.5, 0, 0.2, 1) forwards;
  }
  .track {
    position: absolute;
    top: 0;
    bottom: 18px;
    width: 7px;
  }
  .track-left {
    left: -17px;
  }
  .track-right {
    right: -17px;
  }
  .spine {
    position: absolute;
    left: 3px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(var(--nx-ac), 0.16);
  }
  .cap {
    position: absolute;
    left: 1px;
    width: 5px;
    height: 5px;
    border: 1px solid rgba(var(--nx-ac), 0.4);
    transform: rotate(45deg);
  }
  .cap.top {
    top: -3px;
  }
  .cap.bottom {
    bottom: -3px;
  }
  .tick {
    position: absolute;
    left: 0;
    width: 7px;
    height: 1px;
    background: rgba(var(--nx-ac), 0.45);
  }
  .thumb {
    position: absolute;
    left: 1.5px;
    width: 4px;
    background: rgb(var(--nx-ac));
    box-shadow: 0 0 10px rgb(var(--nx-ac));
    border-radius: 2px;
    cursor: grab;
  }
</style>
