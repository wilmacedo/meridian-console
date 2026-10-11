<script lang="ts">
  import { shellUi } from '../shell/shell-ui.svelte'
  import { dock, placedWidgetIds } from './dock.svelte'
  import WidgetCard from './widget-card.svelte'

  const ids = $derived(placedWidgetIds())
  const open = $derived(shellUi.sheetOpen && ids.length > 0)
  const pad = (n: number): string => String(n).padStart(2, '0')
</script>

<div class="shade" class:on={open} role="presentation" onclick={() => (shellUi.sheetOpen = false)}></div>

<div class="sheet" class:on={open} aria-hidden={!open} inert={!open}>
  <div class="head">
    <span class="label"><i></i>WIDGETS</span>
    <span class="rule"></span>
    <span class="count">{pad(ids.length)}</span>
  </div>
  <div class="list">
    {#each ids as id, i (id)}
      {@const w = dock.widgets[id]}
      <div class="item" class:landed={w.landed} class:closing={w.closing} data-wid={id} style:--h="{w.exitHeight}px" style:--dx="{w.exitDx}px">
        <WidgetCard widget={w} slot={pad(i + 1)} draggable={false} />
      </div>
    {/each}
  </div>
</div>

<style>
  .shade {
    position: absolute;
    inset: 0;
    z-index: 5;
    background: rgba(var(--nx-sh), calc(0.55 * var(--nx-so)));
    backdrop-filter: blur(10px) saturate(0.7);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.38s ease;
  }
  .shade.on {
    opacity: 1;
    pointer-events: auto;
  }
  .sheet {
    position: absolute;
    top: calc(var(--safe-t) + 64px);
    bottom: calc(var(--safe-b) + 176px);
    left: 14px;
    right: 14px;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 10px;
    opacity: 0;
    filter: blur(6px);
    transform: translateY(28px) scale(0.97);
    transform-origin: 50% 100%;
    pointer-events: none;
    transition:
      opacity 0.34s ease,
      filter 0.34s ease,
      transform 0.46s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .sheet.on {
    opacity: 1;
    filter: none;
    transform: none;
    pointer-events: auto;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(var(--nx-ac), 0.55);
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
  .count {
    color: rgba(var(--nx-ac), 0.8);
  }
  .list {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    scrollbar-width: none;
    padding-bottom: 18px;
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
</style>
