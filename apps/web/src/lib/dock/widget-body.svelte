<script lang="ts">
  import DocBlocks from '../docs/doc-blocks.svelte'
  import { registry } from '../services/registry.svelte'
  import type { WidgetDef } from './widgets'

  let { def }: { def: WidgetDef } = $props()

  const STATUS = { ok: ['ONLINE', 'rgb(var(--nx-ac))'], warn: ['DEGRADED', '#ffd34d'], err: ['OFFLINE', '#ff6b8a'] } as const
</script>

{#if def.type === 'doc' && def.blocks}
  <DocBlocks blocks={def.blocks} compact />
{:else if def.type === 'services'}
  <div class="svcs">
    {#each registry.services as s (s.id)}
      {@const [label, color] = STATUS[s.status.state]}
      <div class="svc">
        <span class="dot" style:background={color} style:box-shadow="0 0 6px {color}"></span>
        <span class="name">{s.name}</span>
        <span class="state" style:color>{label}</span>
      </div>
    {/each}
  </div>
{:else}
  <!-- tele, feeder and logs bodies come with their data sources. -->
  <div class="empty">NO DATA SOURCE CONNECTED YET</div>
{/if}

<style>
  .svcs {
    display: flex;
    flex-direction: column;
  }
  .svc {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    gap: 9px;
    align-items: center;
    padding: 5px 0;
    border-bottom: 1px solid rgba(var(--nx-ac), 0.07);
    font: 400 11px/1.2 var(--font-mono);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .name {
    color: rgb(var(--nx-fg));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state {
    font-size: 9px;
    letter-spacing: 0.12em;
  }
  .empty {
    padding: 14px 0;
    text-align: center;
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(var(--nx-ac), 0.5);
  }
</style>
