<script lang="ts">
  import { pointerDrag } from '../windows/pointer-drag'
  import { cancelPending, dock, PENDING_ID } from './dock.svelte'
  import { dragEnd, dragMove, pressPending } from './dock-drag.svelte'
  import { isStacked } from '../workspace/layout.svelte'

  const dragging = $derived(dock.drag?.id === PENDING_ID)
  const stacked = $derived(isStacked())
</script>

<!-- Dims the screen under the rails while a pin waits to be dropped. Clicking it cancels. -->
<div class="scrim" class:on={dock.pending !== null} role="presentation" onclick={cancelPending}></div>

{#if dock.pending}
  <div class="centre" style:opacity={dragging ? 0 : 1} style:pointer-events={dock.drag ? 'none' : 'auto'}>
    {#key dock.pendingLeaving}
      <div class="stack" class:leaving={dock.pendingLeaving}>
        <div class="card" data-pending use:pointerDrag={{ ignore: 'button', threshold: 0, onPress: pressPending, onMove: dragMove, onEnd: dragEnd }}>
          <div class="grip"><span></span><span></span><span></span><span></span><span></span><span></span></div>
          <div class="titles">
            <span class="kicker">{dock.pending.kicker}</span>
            <span class="title">{dock.pending.title}</span>
          </div>
          <button aria-label="Cancel" onclick={cancelPending}>✕</button>
        </div>
        <div class="hint"><span>{stacked ? '↑' : '←'}</span><span>DRAG TO A DOCK</span><span>{stacked ? '↓' : '→'}</span></div>
        <span class="esc">ESC TO CANCEL</span>
      </div>
    {/key}
  </div>
{/if}

<style>
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 4;
    background: radial-gradient(ellipse at center, rgba(var(--nx-sh), 0.35), rgba(var(--nx-sh), 0.7));
    backdrop-filter: blur(7px) saturate(0.6) brightness(0.7);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.35s ease;
  }
  .scrim.on {
    opacity: 1;
    pointer-events: auto;
  }
  .centre {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 25;
    transition: opacity 0.15s;
  }
  .stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    animation: nx-lift 0.45s var(--ease-out) both;
  }
  .stack.leaving {
    animation: nx-drop 0.26s ease-in forwards;
  }
  .card {
    width: min(300px, 24vw);
    min-width: 250px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 12px 12px 14px;
    animation: nx-jiggle 0.28s ease-in-out infinite alternate;
    cursor: grab;
    background: linear-gradient(180deg, rgba(var(--nx-pn), 0.94), rgba(var(--nx-pn), 0.97));
    backdrop-filter: blur(16px);
    border: 1px solid rgba(var(--nx-ac), 0.6);
    border-radius: 12px;
    box-shadow:
      0 28px 70px rgba(var(--nx-sh), 0.6),
      0 0 30px rgba(var(--nx-ac), 0.2);
  }
  .grip {
    display: grid;
    grid-template-columns: repeat(2, 2px);
    gap: 2px;
    flex: none;
    opacity: 0.7;
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
  .kicker {
    font: 400 9px/1.2 var(--font-mono);
    letter-spacing: 0.14em;
    color: rgba(var(--nx-ac), 0.65);
  }
  .title {
    font: 400 21px/1.05 var(--font-serif);
    color: rgb(var(--nx-fg));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button {
    flex: none;
    width: 24px;
    height: 24px;
    padding: 0;
    background: rgba(var(--nx-pn), 0.8);
    border: 1px solid rgba(var(--nx-ac), 0.35);
    border-radius: 50%;
    color: rgb(var(--nx-ac));
    font-size: 10px;
    line-height: 1;
    cursor: pointer;
  }
  button:hover {
    border-color: rgb(var(--nx-ac));
    color: rgb(var(--nx-fg));
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 12px;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.22em;
    color: rgb(var(--nx-ac));
    background: rgba(var(--nx-pn), 0.75);
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid rgba(var(--nx-ac), 0.2);
  }
  .esc {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(var(--nx-ac), 0.5);
  }
</style>
