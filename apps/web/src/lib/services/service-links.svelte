<script lang="ts">
  import type { ServiceSummary } from '@meridian/service-sdk'
  import { eventsView } from '../live/events-view.svelte'
  import { live } from '../live/stream.svelte'
  import { open, openModule } from '../windows/window-manager.svelte'
  import { servicePageId, windowsOf } from './service-ui'

  // `page`: also link to the service's page (the card does; the page itself doesn't).
  let { service, page = false }: { service: ServiceSummary; page?: boolean } = $props()

  const hasLog = $derived(service.emitsEvents || service.actions.length > 0 || live.events.some((e) => e.source === service.id))

  function openLogs(): void {
    eventsView.filter = service.id
    openModule('logs')
  }
</script>

<div class="links">
  {#if page}<button class="link" onclick={() => open(servicePageId(service.id))}>DETAILS →</button>{/if}
  {#if hasLog}<button class="link" onclick={openLogs}>LOGS →</button>{/if}
  {#each windowsOf(service.id) as w (w.windowId)}
    <button class="link" onclick={() => open(w.windowId)}>{w.title.toUpperCase()} →</button>
  {/each}
  {#if service.url}<a class="link" href={service.url} target="_blank" rel="noreferrer">OPEN ↗</a>{/if}
</div>

<style>
  .links {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: auto;
  }
  .link {
    background: none;
    border: 1px solid rgba(var(--nx-ac), 0.28);
    border-radius: 3px;
    color: rgb(var(--nx-ac));
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.16em;
    padding: 6px 10px;
    cursor: pointer;
    text-decoration: none;
  }
  .link:hover {
    border-color: rgba(var(--nx-ac), 0.8);
    color: rgb(var(--nx-fg));
  }
</style>
