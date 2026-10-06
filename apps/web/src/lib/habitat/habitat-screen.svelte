<script lang="ts">
  import FeederCamera from './feeder-camera.svelte'
  import FeederPanel from './feeder-panel.svelte'
</script>

<div class="habitat">
  <div class="title">HABITAT</div>
  <div class="grid">
    <FeederCamera />
    <FeederPanel />
  </div>
</div>

<style>
  .habitat {
    height: 100%;
    overflow-y: auto;
    padding: 18px 22px;
    animation: rise 0.4s ease both;
  }

  .title {
    margin-bottom: 14px;
    font: 600 16px/1.2 var(--font-mono);
    letter-spacing: 0.1em;
    color: var(--text-primary);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    gap: 14px;
    align-items: start;
    max-width: 1040px;
  }
</style>
