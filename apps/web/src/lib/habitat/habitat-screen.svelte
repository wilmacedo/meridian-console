<script lang="ts">
  import { registry } from '../services/registry.svelte'
  import { webServiceFor } from '../services/ui-modules'

  const widgets = $derived(
    registry.services.flatMap((service) =>
      (webServiceFor(service.id)?.habitat ?? []).map((Widget, index) => ({ key: `${service.id}:${index}`, Widget })),
    ),
  )
</script>

<div class="habitat">
  <div class="title">HABITAT</div>
  {#if widgets.length}
    <div class="grid">
      {#each widgets as { key, Widget } (key)}
        <Widget />
      {/each}
    </div>
  {:else}
    <div class="empty">NO HOME DEVICES REGISTERED</div>
  {/if}
</div>

<style>
  .habitat {
    height: 100%;
    overflow-y: auto;
    padding: 18px 22px;
    animation: rise 0.4s ease both;
  }

  .title {
    margin-bottom: 14px;
    font: 600 16px/1.2 var(--font-mono);
    letter-spacing: 0.1em;
    color: var(--text-primary);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    gap: 14px;
    align-items: start;
    max-width: 1040px;
  }

  .empty {
    font: 500 10px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--text-muted);
  }
</style>
