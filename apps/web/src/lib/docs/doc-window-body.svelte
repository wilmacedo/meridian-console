<script lang="ts">
  import DocBlocks from './doc-blocks.svelte'
  import { docs } from './docs.svelte'

  const total = $derived(docs.current?.blocks.length ?? 0)
</script>

{#if docs.current}
  <DocBlocks blocks={docs.current.blocks.slice(0, docs.shown)} />
  {#if docs.shown < total}
    <div class="composing">
      <div class="bar wide"></div>
      <div class="bar narrow"></div>
      <span>NOX IS COMPOSING…</span>
    </div>
  {/if}
{/if}

<style>
  .composing {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 18px;
  }
  .bar {
    height: 10px;
    border-radius: 3px;
    background: rgba(var(--nx-mu), 0.18);
    animation: nx-flash 1.1s ease-in-out infinite;
  }
  .wide {
    width: 72%;
  }
  .narrow {
    width: 48%;
    animation-delay: 0.2s;
  }
  span {
    margin-top: 4px;
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.22em;
    color: rgba(var(--nx-ac), 0.6);
  }
</style>
