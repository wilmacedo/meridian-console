<script lang="ts">
  import { onMount } from 'svelte'
  import { startServicePolling, stopServicePolling } from './lib/services/registry.svelte'

  onMount(() => {
    startServicePolling()
    return stopServicePolling
  })
</script>
