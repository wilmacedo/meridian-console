<script lang="ts">
  import { onMount } from 'svelte'
  import { finishBoot } from './lib/agent/agent-state.svelte'
  import { startClock } from './lib/clock.svelte'
  import CoreLayer from './lib/core/core-layer.svelte'
  import { startServicePolling, stopServicePolling } from './lib/services/registry.svelte'
  import { activeVariant, applyTheme } from './lib/theme/theme.svelte'

  $effect(() => applyTheme(document.documentElement, activeVariant()))

  onMount(() => {
    const stopClock = startClock()
    startServicePolling()
    finishBoot()
    return () => {
      stopClock()
      stopServicePolling()
    }
  })
</script>

<div class="root">
  <CoreLayer />
</div>

<style>
  .root {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: rgb(var(--nx-bg));
  }
</style>
