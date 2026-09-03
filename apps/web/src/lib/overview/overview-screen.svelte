<script lang="ts">
  import { appState, rangeOptions } from '../state/app-state.svelte'
  import ServiceGraph from './service-graph.svelte'
  import WavePanel from './wave-panel.svelte'

  const axisLabels = ['00', '20', '40', '60', '80', '100', '120', '140', '160', '180', '200']
</script>

<div class="overview">
  <div class="ranges">
    {#each rangeOptions as range (range)}
      <button type="button" class:active={appState.range === range} onclick={() => (appState.range = range)}>
        {range}
      </button>
    {/each}
  </div>

  <ServiceGraph />
  <WavePanel />

  <div class="axis">
    {#each axisLabels as label}
      <span>{label}</span>
    {/each}
  </div>
</div>

<style>
  .overview {
    height: 100%;
    display: flex;
    flex-direction: column;
    animation: rise 0.4s ease both;
  }

  .ranges {
    flex: none;
    display: flex;
    justify-content: center;
    margin-bottom: 2px;
  }

  .ranges button {
    all: unset;
    padding: 4px 9px;
    margin: 0 2px;
    border: 1px solid transparent;
    font: 500 8.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: rgba(160, 196, 187, 0.45);
    cursor: pointer;
    transition: all 0.2s;
  }

  .ranges button.active {
    border-color: rgba(79, 214, 184, 0.55);
    color: var(--text-primary);
  }

  .axis {
    flex: none;
    display: flex;
    justify-content: space-between;
    padding: 14px 22px 16px;
    border-top: 1px solid var(--line-hairline);
    font: 500 8.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: rgba(150, 185, 175, 0.4);
  }
</style>
