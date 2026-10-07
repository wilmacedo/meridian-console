<script lang="ts">
  import { dock } from './dock.svelte'
  import { ghostClone } from './dock-drag.svelte'

  const pad = (n: number): string => String(n).padStart(2, '0')
  const d = $derived(dock.drag)
  const badge = $derived(d?.rail ? `→ ${d.rail}·${pad(d.index + 1)}` : 'DROP ON A DOCK')

  // The clone is a snapshot of the dragged card, mounted once when the ghost appears.
  const adopt = (node: HTMLElement): void => {
    if (ghostClone) node.appendChild(ghostClone)
  }
</script>

{#if d}
  <div class="ghost" style:width="{d.w}px" style:transform="translate3d({d.x}px,{d.y}px,0)" style:transition={d.landing ? 'transform .32s var(--ease-out)' : 'none'}>
    <div
      class="tilt"
      class:landing={d.landing}
      style:transform="rotate({d.rot.toFixed(2)}deg) scale({d.landing ? 1 : 1.04})"
      style:transform-origin="{d.ox}px {d.oy}px"
    >
      <div class="clone" use:adopt style:mask-image={d.h > 300 ? 'linear-gradient(to bottom, #000 calc(100% - 50px), transparent)' : 'none'}></div>
      <span class="badge" style:opacity={d.landing ? 0 : 1}>{badge}</span>
    </div>
  </div>
{/if}

<style>
  .ghost {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 30;
    pointer-events: none;
  }
  .tilt {
    position: relative;
    border-radius: 12px;
    box-shadow:
      0 30px 70px rgba(var(--nx-sh), calc(0.6 * var(--nx-so))),
      0 0 36px rgba(var(--nx-ac), 0.25);
    transition:
      transform 0.22s var(--ease-out),
      box-shadow 0.3s ease;
  }
  .tilt.landing {
    box-shadow: 0 10px 24px rgba(var(--nx-sh), calc(0.35 * var(--nx-so)));
  }
  .clone {
    border-radius: 12px;
    overflow: hidden;
    max-height: 300px;
  }
  .badge {
    position: absolute;
    top: -10px;
    right: 12px;
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgb(var(--nx-pn));
    background: rgb(var(--nx-ac));
    padding: 3px 8px;
    border-radius: 999px;
    box-shadow: 0 0 14px rgba(var(--nx-ac), 0.5);
    transition: opacity 0.2s;
  }
</style>
