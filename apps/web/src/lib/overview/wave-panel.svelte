<script lang="ts">
  import { appState } from '../state/app-state.svelte'
  import { polylinePoints, waveSeries } from './wave'

  const spikeDefs = [
    { left: 26, base: 62 },
    { left: 30, base: 40 },
    { left: 34, base: 78 },
    { left: 86, base: 54 },
    { left: 90, base: 70 },
    { left: 94, base: 34 },
  ]

  const waveArea = $derived(polylinePoints(waveSeries(appState.series.a, appState.tick, 0), 820, 150, true, 40))
  const waveLine = $derived(polylinePoints(waveSeries(appState.series.a, appState.tick, 0), 820, 150, false, 40))
  const waveAmber = $derived(polylinePoints(waveSeries(appState.series.a, appState.tick, 1.6), 820, 150, false, 60))
  const waveDash = $derived(polylinePoints(waveSeries(appState.series.a, appState.tick, 3.1), 820, 150, false, 80))

  const spikes = $derived(
    spikeDefs.map((spike, i) => ({
      left: spike.left,
      bottom: 18 + (i % 2) * 6,
      height: spike.base + Math.sin(appState.tick / 3 + i) * 8,
      opacity: 0.55 + (i % 3) * 0.15,
    })),
  )

  const cursorValue = $derived((14000 + (appState.tick % 40) * 12).toLocaleString('en-US'))
  const cursorRows = '97 - 4345 - 2451 - 5631\n67 - 3492 - 3492 - 3421\n17 - 340 - 45\n30 - 3487 - 5031 - 44'
</script>

<div class="wave-panel">
  <svg viewBox="0 0 820 150" preserveAspectRatio="none">
    <polyline points={waveArea} fill="rgba(47,158,134,.28)" stroke="none" />
    <polyline points={waveLine} fill="none" stroke="rgba(79,214,184,.55)" stroke-width="1.2" />
    <polyline points={waveAmber} fill="none" stroke="var(--accent-amber)" stroke-width="1.6" />
    <polyline points={waveDash} fill="none" stroke="rgba(79,214,184,.3)" stroke-width="1" stroke-dasharray="4 6" />
  </svg>

  {#each spikes as spike, i (i)}
    <div
      class="spike"
      style:left={`${spike.left}%`}
      style:bottom={`${spike.bottom}px`}
      style:height={`${spike.height}px`}
      style:opacity={spike.opacity}
    ></div>
  {/each}

  <div class="cursor-line"></div>
  <div class="cursor-value">{cursorValue}<span class="cursor-unit"> MB/S</span></div>
  <div class="cursor-marker">RM</div>
  <div class="cursor-rows">{cursorRows}</div>
</div>

<style>
  .wave-panel {
    position: relative;
    flex: none;
    height: 150px;
    margin-top: -6px;
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .spike {
    position: absolute;
    width: 7px;
    background: var(--accent-amber);
    transition: height 0.9s ease;
  }

  .cursor-line {
    position: absolute;
    left: 50%;
    top: -56px;
    bottom: 0;
    width: 1px;
    background: rgba(224, 123, 40, 0.65);
  }

  .cursor-value {
    position: absolute;
    left: 50%;
    top: -84px;
    transform: translateX(-6px);
    font: 600 11px/1.5 var(--font-mono);
    color: var(--accent-amber);
    white-space: nowrap;
  }

  .cursor-unit {
    font-size: 8px;
    opacity: 0.7;
  }

  .cursor-marker {
    position: absolute;
    left: 50%;
    bottom: -9px;
    transform: translate(-50%, 0);
    width: 18px;
    height: 18px;
    border: 1px solid rgba(224, 123, 40, 0.7);
    background: #0a100e;
    display: grid;
    place-items: center;
    font: 600 7px/1 var(--font-mono);
    color: var(--accent-amber);
  }

  .cursor-rows {
    position: absolute;
    left: 50%;
    top: -30px;
    font: 500 8px/1.5 var(--font-mono);
    color: var(--text-muted);
    white-space: pre;
  }
</style>
