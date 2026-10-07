<script lang="ts">
  import { pointerDrag } from '../windows/pointer-drag'
  import { closeWidget, dock, toggleCollapsed, type Widget } from './dock.svelte'
  import { dragEnd, dragMove, DRAG_START_THRESHOLD, pressWidget } from './dock-drag.svelte'
  import WidgetBody from './widget-body.svelte'

  let { widget, slot }: { widget: Widget; slot: string } = $props()

  const agent = $derived(widget.def.src === 'agent')
</script>

<div class="card">
  <div class="topline"></div>
  {#if dock.flash === widget.id}
    {#key dock.flashCount}<div class="flash"></div>{/key}
  {/if}
  <div
    class="head"
    class:collapsed={widget.collapsed}
    use:pointerDrag={{ ignore: 'button', threshold: DRAG_START_THRESHOLD, onPress: (e) => pressWidget(e, widget.id), onMove: dragMove, onEnd: dragEnd }}
  >
    <div class="grip"><span></span><span></span><span></span><span></span><span></span><span></span></div>
    <div class="titles">
      <div class="meta">
        <span class="tag" class:agent>{agent ? 'NOX' : 'SYS'}</span>
        <span class="kicker">{widget.def.kicker}</span>
      </div>
      <div class="title">{widget.def.title}</div>
    </div>
    <span class="slot">{slot}</span>
    <div class="btns">
      <button aria-label={widget.collapsed ? 'Expand' : 'Collapse'} onclick={() => toggleCollapsed(widget.id)}>{widget.collapsed ? '+' : '−'}</button>
      <button class="x" aria-label="Close" onclick={() => closeWidget(widget.id)}>✕</button>
    </div>
  </div>
  <div class="rows" class:collapsed={widget.collapsed}>
    <div class="clip">
      <div class="inner"><WidgetBody def={widget.def} /></div>
    </div>
  </div>
</div>

<style>
  .card {
    position: relative;
    background: linear-gradient(180deg, rgba(var(--nx-pn), 0.86), rgba(var(--nx-pn), 0.93));
    backdrop-filter: blur(16px) saturate(1.3);
    border: 1px solid rgba(var(--nx-hi), 0.1);
    border-radius: 12px;
    overflow: hidden;
    box-shadow:
      0 18px 40px rgba(var(--nx-sh), 0.45),
      inset 0 1px 0 rgba(var(--nx-hi), 0.06);
  }
  .topline {
    position: absolute;
    left: 18%;
    right: 18%;
    top: 0;
    height: 1px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(var(--nx-ac), 0.7), transparent);
  }
  .flash {
    position: absolute;
    inset: 0;
    border-radius: 12px;
    pointer-events: none;
    border: 1px solid rgb(var(--nx-ac));
    box-shadow: inset 0 0 24px rgba(var(--nx-ac), 0.25);
    animation: nx-flash 0.55s ease-in-out 4 both;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 10px 10px 12px;
    cursor: grab;
    border-bottom: 1px solid rgba(var(--nx-ac), 0.12);
    transition: border-color 0.3s ease;
  }
  .head.collapsed {
    border-bottom-color: transparent;
  }
  .grip {
    display: grid;
    grid-template-columns: repeat(2, 2px);
    gap: 2px;
    flex: none;
    opacity: 0.6;
  }
  .grip span {
    width: 2px;
    height: 2px;
    background: rgb(var(--nx-ac));
  }
  .titles {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .meta {
    display: flex;
    gap: 7px;
    align-items: center;
    font: 400 9px/1.2 var(--font-mono);
    letter-spacing: 0.14em;
    color: rgba(var(--nx-ac), 0.6);
  }
  .tag {
    flex: none;
    color: rgba(var(--nx-ac), 0.6);
    border: 1px solid rgba(var(--nx-ac), 0.25);
    border-radius: 3px;
    padding: 1px 5px;
  }
  .tag.agent {
    color: rgb(var(--nx-ac));
    border-color: rgba(var(--nx-ac), 0.6);
  }
  .kicker {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title {
    font: 400 20px/1.05 var(--font-serif);
    color: rgb(var(--nx-fg));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .slot {
    flex: none;
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: rgba(var(--nx-ac), 0.45);
  }
  .btns {
    display: flex;
    gap: 4px;
    flex: none;
  }
  .btns button {
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
  .btns .x {
    font-size: 10px;
  }
  .btns button:hover {
    border-color: rgba(var(--nx-ac), 0.7);
    color: rgb(var(--nx-fg));
  }
  .rows {
    display: grid;
    grid-template-rows: 1fr;
    transition: grid-template-rows 0.38s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .rows.collapsed {
    grid-template-rows: 0fr;
  }
  .clip {
    min-height: 0;
    overflow: hidden;
  }
  .inner {
    padding: 10px 12px 12px;
    transition:
      opacity 0.28s ease,
      transform 0.38s cubic-bezier(0.4, 0, 0.2, 1),
      filter 0.28s ease;
  }
  .collapsed .inner {
    opacity: 0;
    transform: translateY(-8px);
    filter: blur(4px);
  }
</style>
