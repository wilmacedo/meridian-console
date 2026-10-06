<script lang="ts">
  import { onMount } from 'svelte'
  import ConsoleShell from './lib/shell/console-shell.svelte'
  import OverviewScreen from './lib/overview/overview-screen.svelte'
  import ServiceFrame from './lib/service/service-frame.svelte'
  import GenericServicePanel from './lib/service/generic-service-panel.svelte'
  import HabitatScreen from './lib/habitat/habitat-screen.svelte'
  import { registry, startServicePolling, stopServicePolling } from './lib/services/registry.svelte'
  import { selectedService } from './lib/services/selection'
  import { webServiceFor } from './lib/services/ui-modules'
  import { appState, startAppClocks, stopAppClocks } from './lib/state/app-state.svelte'

  const selected = $derived(selectedService())
  const CustomPanel = $derived(selected && webServiceFor(selected.id)?.panel)

  onMount(() => {
    startAppClocks()
    startServicePolling()
    return () => {
      stopAppClocks()
      stopServicePolling()
    }
  })
</script>

<ConsoleShell>
  {#if appState.screen === 'overview'}
    <OverviewScreen />
  {:else if appState.screen === 'home'}
    <HabitatScreen />
  {:else if appState.screen === 'service' && selected}
    {#key selected.id}
      <ServiceFrame service={selected}>
        {#if CustomPanel}
          <CustomPanel service={selected} />
        {:else}
          <GenericServicePanel service={selected} />
        {/if}
      </ServiceFrame>
    {/key}
  {:else if appState.screen === 'service'}
    <div class="placeholder">{registry.unreachable ? 'Server unreachable' : 'No services registered'}</div>
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
