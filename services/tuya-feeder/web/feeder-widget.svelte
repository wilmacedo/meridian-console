<script lang="ts">
  import { onMount } from 'svelte'
  import { feeder, hopper, lastFed, watchFeeder } from './feeder-state.svelte'

  onMount(watchFeeder)

  const level = $derived(hopper(feeder.status))
  const dispensing = $derived(feeder.phase === 'sending' || feeder.phase === 'waiting')
</script>

<div class="body">
  <div class="hopper">
    <div class="row"><span class="key">HOPPER</span><span class="value">{level ? level.label : '—'}</span></div>
    <div class="track"><div class="fill" style:width="{level?.level ?? 0}%"></div></div>
  </div>
  <div class="last">{feeder.unreachable ? 'UNREACHABLE' : `LAST FED ${lastFed(feeder.status)}`}{dispensing ? ' · DISPENSING' : ''}</div>
</div>

<style>
  .body {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .hopper {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.12em;
  }
  .key {
    color: rgba(var(--nx-ac), 0.75);
  }
  .value {
    color: rgb(var(--nx-fg));
  }
  .track {
    height: 4px;
    border-radius: 2px;
    background: rgba(var(--nx-mu), 0.22);
    position: relative;
    overflow: hidden;
  }
  .fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: linear-gradient(90deg, rgb(var(--nx-mu)), rgb(var(--nx-ac)));
    box-shadow: 0 0 8px rgb(var(--nx-ac));
    border-radius: 2px;
    transition: width 0.8s ease;
  }
  .last {
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.1em;
    color: rgba(var(--nx-ac), 0.55);
  }
</style>
