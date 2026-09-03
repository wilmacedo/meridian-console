<script lang="ts">
  import { onMount } from 'svelte'
  import ConsoleShell from './lib/shell/console-shell.svelte'
  import OverviewScreen from './lib/overview/overview-screen.svelte'
  import { appState, startAppClocks, stopAppClocks } from './lib/state/app-state.svelte'

  onMount(() => {
    startAppClocks()
    return () => stopAppClocks()
  })
</script>

<ConsoleShell>
  {#if appState.screen === 'overview'}
    <OverviewScreen />
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
