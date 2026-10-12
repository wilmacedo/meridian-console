<script lang="ts">
  import FeederAutomation from './feeder-automation.svelte'
  import FeederCameraTile from './feeder-camera-tile.svelte'
</script>

<div class="grid">
  <div class="feeds"><FeederCameraTile /></div>
  <FeederAutomation />
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
    align-items: start;
  }
</style>
