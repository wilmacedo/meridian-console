<script lang="ts">
  import { wm } from '../windows/window-manager.svelte'
  import { switchFx } from '../workspace/switch-fx.svelte'
  import { carGeometry, carTileIds } from './car.svelte'
  import CarTileCard from './car-tile-card.svelte'

  const g = $derived(carGeometry())
  const ids = $derived(carTileIds())
  // Windows take the screen, one at a time.
  const hidden = $derived(wm.wins.some((w) => !w.closing))
</script>

{#if ids.length && !hidden}
  <div
    class="tiles"
    style:width="{g.colW}px"
    style:bottom="{g.bar + 24}px"
    style:grid-template-columns="repeat({g.cols}, minmax(0, 1fr))"
    style:grid-template-rows="repeat({g.rows}, minmax({g.rowMin}px, 1fr))"
    style:opacity={switchFx.current ? 0 : 1}
    style:filter={switchFx.current ? 'blur(12px)' : 'none'}
  >
    {#each ids as id, i (id)}<CarTileCard {id} index={i} compact={g.rowMin < 100} />{/each}
  </div>
{/if}

<style>
  .tiles {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 5;
    display: grid;
    gap: 10px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    transition:
      opacity 0.34s ease,
      filter 0.34s ease;
  }
</style>
