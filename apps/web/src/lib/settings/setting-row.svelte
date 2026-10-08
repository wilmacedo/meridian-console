<script lang="ts">
  import type { Snippet } from 'svelte'

  let { title, note, wide = false, children }: { title: string; note?: string; wide?: boolean; children: Snippet } = $props()
</script>

<div class="row" class:wide>
  <div class="text">
    <span class="title">{title}</span>
    {#if note}<span class="note">{note}</span>{/if}
  </div>
  <div class="control">{@render children()}</div>
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
  }
  .row.wide {
    grid-template-columns: minmax(0, 1fr) minmax(0, 240px);
  }
  /* On a phone the control would leave the text a few letters wide. */
  @media (max-width: 520px) {
    .row.wide {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .title {
    font-size: 13px;
    font-weight: 500;
    color: rgb(var(--nx-fg));
  }
  .note {
    font-size: 11.5px;
    line-height: 1.45;
    color: rgba(var(--nx-ac), 0.7);
    text-wrap: pretty;
  }
  .control {
    min-width: 0;
  }
</style>
