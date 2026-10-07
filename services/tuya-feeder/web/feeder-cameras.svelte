<script lang="ts">
  import { onMount } from 'svelte'
  import FeederCameraTile from './feeder-camera-tile.svelte'
  import { askDispense, cancelDispense, confirmDispense, feeder, hopper, lastFed, watchFeeder } from './feeder-state.svelte'

  onMount(watchFeeder)

  const level = $derived(hopper(feeder.status))
  const busy = $derived(feeder.phase === 'sending' || feeder.phase === 'waiting')
  const label = $derived(
    feeder.phase === 'confirming' ? 'CONFIRM · 1 PORTION' : feeder.phase === 'sending' ? 'SENDING…' : feeder.phase === 'waiting' ? 'DISPENSING…' : 'DISPENSE NOW',
  )
  const press = (): void => (feeder.phase === 'idle' ? askDispense() : feeder.phase === 'confirming' ? void confirmDispense() : undefined)
</script>

<div class="grid">
  <div class="feeds"><FeederCameraTile /></div>
  <div class="card glass-card">
    <div class="label">AUTOMATION · FEEDER</div>
    <div class="hopper">
      <div class="row"><span class="label">HOPPER</span><span class="value">{level ? level.label : '—'}{#if level?.stale}<span class="stale"> · STALE</span>{/if}</span></div>
      <div class="track"><div class="fill" style:width="{level?.level ?? 0}%"></div></div>
    </div>
    {#if feeder.status?.blocked}<div class="clog">DISPENSER CLOGGED</div>{/if}
    <button class="dispense" class:confirm={feeder.phase === 'confirming'} disabled={busy || feeder.unreachable} onclick={press}>{label}</button>
    {#if feeder.phase === 'confirming'}<button class="cancel" onclick={cancelDispense}>CANCEL</button>{/if}
    {#if feeder.outcome}<div class="outcome" class:bad={!feeder.outcome.ok}>{feeder.outcome.text}</div>{/if}
    <div class="last">{feeder.unreachable ? 'FEEDER UNREACHABLE' : `LAST FED ${lastFed(feeder.status)}`}</div>
  </div>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
    align-items: start;
  }
  .card {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: nx-sub 0.55s ease 0.3s both;
  }
  .label {
    font: 500 11px/1 var(--font-ui);
    letter-spacing: 0.06em;
    color: rgb(var(--nx-ac));
  }
  .hopper {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .row {
    display: flex;
    justify-content: space-between;
  }
  .value {
    font: 500 11px/1 var(--font-ui);
    letter-spacing: 0.06em;
    color: rgb(var(--nx-fg));
  }
  .stale {
    color: rgba(var(--nx-ac), 0.6);
  }
  .track {
    height: 5px;
    border-radius: 3px;
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
    box-shadow: 0 0 10px rgb(var(--nx-ac));
    border-radius: 3px;
    transform-origin: left;
    transition: width 0.8s ease;
    animation: nx-bar 0.9s var(--ease-out) 0.45s both;
  }
  .clog {
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: #ff6b8a;
  }
  .dispense {
    background: rgba(var(--nx-mu), 0.16);
    border: 1px solid rgba(var(--nx-ac), 0.6);
    border-radius: 10px;
    color: rgb(var(--nx-fg));
    font: 600 13px/1 var(--font-mono);
    letter-spacing: 0.3em;
    padding: 13px;
    cursor: pointer;
    box-shadow: 0 0 20px rgba(var(--nx-mu), 0.25);
  }
  .dispense:hover:not(:disabled) {
    background: rgba(var(--nx-mu), 0.32);
  }
  .dispense.confirm {
    border-color: #ffd34d;
    color: #ffd34d;
  }
  .dispense:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .cancel {
    background: none;
    border: none;
    padding: 0;
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(var(--nx-ac), 0.7);
    cursor: pointer;
  }
  .outcome {
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: rgb(var(--nx-ac));
  }
  .outcome.bad {
    color: #ff6b8a;
  }
  .last {
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.1em;
    color: rgba(var(--nx-ac), 0.6);
  }
</style>
