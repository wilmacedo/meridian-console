<script lang="ts">
  import { flip } from 'svelte/animate'
  import { pointerDrag } from '../windows/pointer-drag'
  import { dock, setRailEl } from './dock.svelte'
  import type { RailId } from './widgets'
  import WidgetCard from './widget-card.svelte'

  let { rail }: { rail: RailId } = $props()

  const pad = (n: number): string => String(n).padStart(2, '0')
  const left = $derived(rail === 'L')
  const ids = $derived(dock.rails[rail])
  const visible = $derived(ids.length > 0)

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
  let bar = $state({ on: false, top: 0, height: 100, atTop: true, atEnd: true, ticks: [] as number[] })

  function measure(): void {
    const sh = list.scrollHeight
    const ch = list.clientHeight
    const st = list.scrollTop
    const on = sh > ch + 2
    bar = {
      on,
      top: on ? (st / sh) * 100 : 0,
      height: on ? (ch / sh) * 100 : 100,
      atTop: st < 2,
      atEnd: st + ch >= sh - 2,
      ticks: on ? [...list.querySelectorAll<HTMLElement>('[data-wid]')].slice(1).map((n) => ((n.offsetTop - 5) / sh) * 100) : [],
    }
  }

  $effect(() => {
    setRailEl(rail, list)
    const ro = new ResizeObserver(measure)
    ro.observe(list)
    ro.observe(content)
    measure()
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

  const mask = $derived(bar.on ? `linear-gradient(to bottom, ${bar.atTop ? '#000' : 'transparent'} 0, #000 26px, #000 calc(100% - 26px), ${bar.atEnd ? '#000' : 'transparent'} 100%)` : 'none')
</script>

<div class="rail" class:left class:right={!left} class:visible>
  <div class="head">
    <span class="label"><i></i>DOCK·{rail}</span>
    <span class="rule"></span>
    <span class="count">{pad(ids.length)}</span>
  </div>
  <div class="well">
    <div class="list" bind:this={list} data-rail={rail} onscroll={measure} style:mask-image={mask} style:-webkit-mask-image={mask}>
      <div class="content" bind:this={content}>
        {#each ids as id, i (id)}
          {@const w = dock.widgets[id]}
          <div
            class="item"
            class:closing={w.closing}
            class:landed={w.landed}
            data-wid={id}
            style:--h="{w.exitHeight}px"
            style:--dx="{w.exitDx}px"
            animate:flip={{ duration: 300, easing: ease }}
          >
            <WidgetCard widget={w} slot="{rail}·{pad(i + 1)}" />
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
