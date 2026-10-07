<script lang="ts">
  import { onMount } from 'svelte'
  import { startClock } from './lib/clock.svelte'
  import { startServicePolling, stopServicePolling } from './lib/services/registry.svelte'
  import { activeVariant, applyTheme } from './lib/theme/theme.svelte'

  $effect(() => applyTheme(document.documentElement, activeVariant()))

  onMount(() => {
    const stopClock = startClock()
    startServicePolling()
    return () => {
      stopClock()
      stopServicePolling()
    }
  })
</script>
