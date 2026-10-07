<script lang="ts">
  import { onMount } from 'svelte'
  import { finishBoot } from './lib/agent/agent-state.svelte'
  import { startClock } from './lib/clock.svelte'
  import CoreLayer from './lib/core/core-layer.svelte'
  import BottomDock from './lib/shell/bottom-dock.svelte'
  import Header from './lib/shell/header.svelte'
  import { loadHost } from './lib/shell/host.svelte'
  import { handleShortcut } from './lib/shell/keyboard'
  import StateLabel from './lib/shell/state-label.svelte'
  import { startServicePolling, stopServicePolling } from './lib/services/registry.svelte'
  import { activeVariant, applyTheme } from './lib/theme/theme.svelte'

  $effect(() => applyTheme(document.documentElement, activeVariant()))

  onMount(() => {
    const stopClock = startClock()
    startServicePolling()
    finishBoot()
    void loadHost()
    return () => {
      stopClock()
      stopServicePolling()
    }
  })
</script>

<svelte:window onkeydown={(e) => handleShortcut(e, () => false)} />

<div class="root">
  <CoreLayer />
  <Header />
  <StateLabel />
  <BottomDock />
</div>

<style>
  .root {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: rgb(var(--nx-bg));
  }
</style>
