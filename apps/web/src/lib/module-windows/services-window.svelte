<script lang="ts">
  import { uptime } from '../live/format'
  import ActionRow from '../services/action-row.svelte'
  import ServiceHead from '../services/service-head.svelte'
  import ServiceLinks from '../services/service-links.svelte'
  import { servicePageId } from '../services/service-ui'
  import { live } from '../live/stream.svelte'
  import { visibleServices } from '../workspace/prefs.svelte'
  import { open } from '../windows/window-manager.svelte'

  // Every card keeps room for this many endpoint rows and the "+N MORE" line, used or not, so a service with
  // dozens of endpoints is as tall as one with none; the page lists them all.
  const CARD_ROWS = 3

  const uptimeOf = (container: string | undefined): string => {
    const c = container ? live.containers.find((x) => x.name === container) : undefined
    return c ? uptime(c.uptimeSec) : '—'
  }
</script>

<div class="grid">
  {#each visibleServices() as s, i (s.id)}
    {@const shown = s.actions.slice(0, CARD_ROWS)}
    <div class="card glass-card" class:offline={s.status.state === 'offline'} style:animation-delay="{0.16 + i * 0.06}s">
      <ServiceHead service={s} compact />
      <div class="meta">
        {#if s.runtime}<span>{s.runtime}</span>{/if}
        {#if s.address}<span>{s.address}</span>{/if}
        <span>UP {uptimeOf(s.container)}</span>
      </div>
      <div class="actions" style:--rows={CARD_ROWS}>
        {#each shown as a (a.id)}
          <ActionRow serviceId={s.id} serviceName={s.name} action={a} />
        {:else}
          <div class="none">NO ENDPOINTS</div>
        {/each}
        {#if s.actions.length > CARD_ROWS}
          <button class="more" onclick={() => open(servicePageId(s.id))}>+{s.actions.length - CARD_ROWS} MORE ENDPOINTS →</button>
        {/if}
      </div>
      <ServiceLinks service={s} page />
    </div>
  {:else}
    <div class="empty">{live.link !== 'offline' ? 'NO SERVICES REGISTERED' : 'SERVER UNREACHABLE'}</div>
  {/each}
</div>
<div class="note">Services come from the services folder, or are added by NOX</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    grid-auto-rows: 1fr;
    gap: 10px;
  }
  .card {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 11px;
    animation: nx-sub 0.55s ease both;
  }
  .card.offline {
    opacity: 0.5;
  }
  .meta {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font: 400 10px/1.2 var(--font-mono);
    letter-spacing: 0.06em;
    color: rgba(var(--nx-ac), 0.65);
  }
  /* Fixed tracks: the endpoint rows, then the "+N MORE" line, whether or not they are filled. */
  .actions {
    display: grid;
    grid-template-rows: repeat(var(--rows), 20px) 12px;
    gap: 6px;
    align-items: center;
    border-top: 1px solid rgba(var(--nx-ac), 0.14);
    padding-top: 10px;
  }
  .none {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgba(var(--nx-ac), 0.4);
  }
  .more {
    grid-row: -2;
    justify-self: start;
    padding: 0;
    background: none;
    border: none;
    color: rgba(var(--nx-ac), 0.65);
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.16em;
    cursor: pointer;
  }
  .more:hover {
    color: rgb(var(--nx-fg));
  }
  .note {
    margin-top: 14px;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.08em;
    color: rgba(var(--nx-ac), 0.5);
  }
  .empty {
    grid-column: 1 / -1;
    padding: 24px 0;
    text-align: center;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.22em;
    color: rgba(var(--nx-ac), 0.5);
  }
</style>
