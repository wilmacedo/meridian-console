<script lang="ts">
  import { moduleContributions } from '../services/service-ui'

  // The Cameras module is a frame for whatever services contribute to it.
  const contributions = moduleContributions('cameras')
</script>

<div class="stack">
  {#each contributions as c (c.windowId + c.serviceId + c.id)}
    {@const Body = c.component}
    <Body />
  {:else}
    <div class="empty">NO CAMERAS REGISTERED</div>
  {/each}
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .empty {
    padding: 24px 0;
    text-align: center;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.22em;
    color: rgba(var(--nx-ac), 0.5);
  }
</style>
