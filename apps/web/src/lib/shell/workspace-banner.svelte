<script lang="ts">
  import { switchFx } from '../workspace/switch-fx.svelte'

  const fx = $derived(switchFx.current)
  const animation = $derived(fx?.phase === 'leave' ? 'nx-fade 0.4s ease forwards' : fx?.boot ? 'nx-in 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) 0.35s both' : 'nx-in 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both')
</script>

{#if fx}
  {#key fx.key}
    <div class="banner" style:animation>
      <span class="label">{fx.boot ? 'BOOTING · WORKSPACE' : 'WORKSPACE'} {fx.code}</span>
      <span class="name">{fx.name}</span>
      <span class="bar"></span>
    </div>
  {/key}
{/if}

<style>
  .banner {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(46% - 60px);
    z-index: 20;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .label {
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.34em;
    padding-left: 0.34em;
    color: rgb(var(--nx-ac));
  }
  .name {
    font: 400 64px/1 var(--font-serif);
    letter-spacing: -0.01em;
    color: rgb(var(--nx-fg));
    text-shadow:
      0 0 40px rgba(var(--nx-bg), 0.9),
      0 0 24px rgba(var(--nx-ac), 0.35);
  }
  .bar {
    width: 240px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgb(var(--nx-ac)), transparent);
    box-shadow: 0 0 10px rgb(var(--nx-ac));
    transform-origin: center;
    animation: nx-bar 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) 0.1s both;
  }
</style>
