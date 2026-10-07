<script lang="ts">
  import type { Snippet } from 'svelte'
  import { clock } from '../clock.svelte'
  import { dock, pinLabel, requestPin } from '../dock/dock.svelte'
  import { pinDef } from '../dock/pin'
  import { docs } from '../docs/docs.svelte'
  import { host } from '../shell/host.svelte'
  import { pointerDrag, type PointerDragOptions } from './pointer-drag'
  import { windowMeta } from './window-meta'
  import { beginGesture, close, endGesture, focus, moveGesture, nudge, rectFor, toggleMaximise, wm, type GestureMode, type WindowState } from './window-manager.svelte'

  let { win, footLeft = '', children }: { win: WindowState; footLeft?: string; children?: Snippet } = $props()

  const pin = $derived(pinDef(win.id))
  const rect = $derived(rectFor(win))
  const meta = $derived(windowMeta(win.id, { hostName: host.name, doc: docs.current }))
  const focused = $derived(wm.active === win.id)
  const dragging = $derived(wm.gesture === win.id)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const syncedAt = $derived(`${pad(clock.now.getHours())}:${pad(clock.now.getMinutes())}`)

  const gesture = (mode: GestureMode, extra: Partial<PointerDragOptions> = {}): PointerDragOptions => ({
    cursor: mode === 'move' ? 'grabbing' : { e: 'ew-resize', w: 'ew-resize', s: 'ns-resize', se: 'nwse-resize', sw: 'nesw-resize' }[mode],
    onPress: () => focus(win.id),
    onStart: () => beginGesture(win.id),
    onMove: (dx, dy) => moveGesture(win.id, mode, dx, dy),
    onEnd: endGesture,
    ...extra,
  })

  function onHeaderKey(e: KeyboardEvent): void {
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const step = arrows[e.key]
    if (!step) return
    e.preventDefault()
    nudge(win.id, step[0], step[1], e.shiftKey)
  }
</script>

<div
  class="win"
  role="dialog"
  aria-label={meta.title}
  tabindex="-1"
  style:left="{rect.x}px"
  style:top="{rect.y}px"
  style:width="{rect.w}px"
  style:height="{rect.h}px"
  style:z-index={win.z}
  style:pointer-events={win.closing ? 'none' : 'auto'}
  style:transition={wm.gesture ? 'none' : 'left .42s var(--ease-out), top .42s var(--ease-out), width .42s var(--ease-out), height .42s var(--ease-out)'}
  onpointerdown={() => focus(win.id)}
>
  <div class="surface" class:focused class:dragging class:closing={win.closing}>
    <div class="sweep"></div>
    <div class="topline"></div>
    <div class="head" role="button" tabindex="0" aria-roledescription="draggable window header" aria-label="{meta.title}: arrows move, shift and arrows resize" use:pointerDrag={gesture('move', { ignore: 'button' })} ondblclick={() => toggleMaximise(win.id)} onkeydown={onHeaderKey}>
      <div class="badge">{meta.index}</div>
      <div class="titles">
        <div class="kicker">{meta.kicker}</div>
        <div class="title">{meta.title}</div>
      </div>
      {#if pin}
        <button class="pin" disabled={dock.pending !== null} onclick={() => requestPin(pin)}><i></i>{pinLabel(pin)}</button>
      {/if}
      <button class="close" aria-label="Close" onclick={() => close(win.id)}>✕</button>
    </div>
    <div class="body">{@render children?.()}</div>
    <div class="foot"><span>{footLeft}</span><span>SYNCED AT {syncedAt}</span></div>
  </div>
  <div class="rz e" use:pointerDrag={gesture('e')}></div>
  <div class="rz w" use:pointerDrag={gesture('w')}></div>
  <div class="rz s" use:pointerDrag={gesture('s')}></div>
  <div class="rz se" use:pointerDrag={gesture('se')}><span></span></div>
  <div class="rz sw" use:pointerDrag={gesture('sw')}></div>
  {#if dragging}<div class="readout">{wm.readout}</div>{/if}
</div>

<style>
  .win {
    position: absolute;
    outline: none;
  }
  .surface {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: linear-gradient(180deg, rgba(var(--nx-pn), 0.88), rgba(var(--nx-pn), 0.92));
    backdrop-filter: blur(18px) saturate(1.4);
    border: 1px solid rgba(var(--nx-hi), 0.08);
    border-radius: 16px;
    animation:
      nx-in 0.62s cubic-bezier(0.2, 0.7, 0.2, 1) both,
      nx-edge 1.1s ease-out both;
    transition:
      border-color 0.25s,
      box-shadow 0.25s;
  }
  .surface.focused {
    border-color: rgba(var(--nx-hi), 0.2);
  }
  .surface.closing {
    animation: nx-close 0.46s cubic-bezier(0.6, 0, 0.3, 1) forwards;
  }
  .sweep {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 38%;
    pointer-events: none;
    z-index: 3;
    background: linear-gradient(90deg, transparent, rgba(var(--nx-ac), 0.16) 45%, rgba(var(--nx-ac), 0.28) 50%, rgba(var(--nx-ac), 0.16) 55%, transparent);
    animation: nx-sweep 1.05s cubic-bezier(0.3, 0.6, 0.3, 1) 0.18s both;
  }
  .topline {
    position: absolute;
    left: 14%;
    right: 14%;
    top: 0;
    height: 1px;
    pointer-events: none;
    opacity: 0.3;
    transition: opacity 0.25s;
    background: linear-gradient(90deg, transparent, rgba(var(--nx-ac), 0.95), transparent);
    box-shadow: 0 0 12px rgba(var(--nx-ac), 0.9);
  }
  .focused .topline {
    opacity: 0.95;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(var(--nx-ac), 0.16);
    animation: nx-sub 0.5s ease 0.12s both;
    cursor: grab;
    outline: none;
  }
  .head:focus-visible {
    box-shadow: inset 0 0 0 1px rgba(var(--nx-ac), 0.5);
  }
  .badge {
    width: 32px;
    height: 32px;
    flex: none;
    display: grid;
    place-items: center;
    border: 1px solid rgba(var(--nx-ac), 0.75);
    border-radius: 8px;
    background: rgba(var(--nx-mu), 0.14);
    font: 600 12px/1 var(--font-mono);
    color: rgb(var(--nx-ac));
  }
  .titles {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .kicker {
    font: 500 11px/1 var(--font-ui);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgb(var(--nx-ac));
  }
  .title {
    font: 400 28px/1 var(--font-serif);
    letter-spacing: -0.01em;
    color: rgb(var(--nx-fg));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pin {
    height: 30px;
    flex: none;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(var(--nx-mu), 0.08);
    border: 1px solid rgba(var(--nx-ac), 0.35);
    border-radius: 8px;
    color: rgb(var(--nx-ac));
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.16em;
    cursor: pointer;
  }
  .pin:hover:not(:disabled) {
    background: rgba(var(--nx-mu), 0.22);
    color: rgb(var(--nx-fg));
  }
  .pin:disabled {
    cursor: default;
  }
  .pin i {
    width: 5px;
    height: 5px;
    border: 1px solid currentColor;
    transform: rotate(45deg);
  }
  .close {
    width: 30px;
    height: 30px;
    flex: none;
    background: rgba(var(--nx-mu), 0.08);
    border: 1px solid rgba(var(--nx-ac), 0.35);
    border-radius: 8px;
    color: rgb(var(--nx-ac));
    font-size: 13px;
    cursor: pointer;
  }
  .close:hover {
    background: rgba(var(--nx-mu), 0.22);
    color: rgb(var(--nx-fg));
  }
  .body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 18px 20px;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 11px 20px;
    border-top: 1px solid rgba(var(--nx-ac), 0.16);
    font: 600 10.5px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgb(var(--nx-ac));
    animation: nx-sub 0.5s ease 0.5s both;
  }
  .rz {
    position: absolute;
    z-index: 4;
  }
  .e,
  .w {
    top: 18px;
    bottom: 18px;
    width: 10px;
    cursor: ew-resize;
  }
  .e {
    right: -5px;
  }
  .w {
    left: -5px;
  }
  .s {
    left: 18px;
    right: 18px;
    bottom: -5px;
    height: 10px;
    cursor: ns-resize;
  }
  .se,
  .sw {
    bottom: -5px;
    width: 20px;
    height: 20px;
  }
  .se {
    right: -5px;
    cursor: nwse-resize;
  }
  .sw {
    left: -5px;
    cursor: nesw-resize;
  }
  .se span {
    position: absolute;
    right: 9px;
    bottom: 9px;
    width: 8px;
    height: 8px;
    border-right: 1.5px solid rgba(var(--nx-ac), 0.55);
    border-bottom: 1.5px solid rgba(var(--nx-ac), 0.55);
    border-radius: 0 0 4px 0;
    pointer-events: none;
  }
  .readout {
    position: absolute;
    left: 50%;
    bottom: -30px;
    transform: translateX(-50%);
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: rgb(var(--nx-pn));
    background: rgb(var(--nx-ac));
    padding: 3px 9px;
    border-radius: 999px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 5;
    box-shadow: 0 0 14px rgba(var(--nx-ac), 0.4);
  }
</style>
