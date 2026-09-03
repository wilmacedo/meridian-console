<script lang="ts">
  import { onMount } from 'svelte'
  import ConsoleShell from './lib/shell/console-shell.svelte'
  import OverviewScreen from './lib/overview/overview-screen.svelte'
  import ServicePanel from './lib/service/service-panel.svelte'
  import { services } from './lib/data/services'
  import { appState, startAppClocks, stopAppClocks } from './lib/state/app-state.svelte'

  const selectedKind = $derived((services.find((s) => s.id === appState.svcId) ?? services[0]).kind)

  onMount(() => {
    startAppClocks()
    return () => stopAppClocks()
  })
</script>

<ConsoleShell>
  {#if appState.screen === 'overview'}
    <OverviewScreen />
  {:else if appState.screen === 'service' && selectedKind !== 'packet'}
    <ServicePanel />
  {:else}
    <div class="placeholder">Screen not wired up yet</div>
  {/if}
</ConsoleShell>

<style>
  .placeholder {
    display: grid;
    place-items: center;
    height: 100%;
    min-height: 600px;
    font: 500 10px/1 var(--font-mono);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
</style>
