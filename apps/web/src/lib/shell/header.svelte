<script lang="ts">
  import { clock } from '../clock.svelte'
  import { registry } from '../services/registry.svelte'
  import { host } from './host.svelte'

  const pad = (n: number): string => String(n).padStart(2, '0')
  const time = $derived(`${pad(clock.now.getHours())}:${pad(clock.now.getMinutes())}:${pad(clock.now.getSeconds())}`)
  const online = $derived(registry.services.filter((s) => s.status.state === 'online').length)
</script>

<header>
  <span class="brand"><i class="diamond"></i>NOX // NEURAL INTERFACE</span>
  <span class="sep"></span>
  <span>{host.name.toUpperCase()}</span>
  <span class="sep"></span>
  <span>SVC {online}/{registry.services.length}</span>
  <span class="sep"></span>
  <span class="clock">{time}</span>
</header>

<style>
  header {
    position: absolute;
    top: 18px;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 18px;
    pointer-events: none;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.06em;
    color: rgba(var(--nx-ac), 0.55);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .diamond {
    width: 5px;
    height: 5px;
    border: 1px solid rgba(var(--nx-ac), 0.7);
    transform: rotate(45deg);
  }
  .sep {
    width: 40px;
    height: 1px;
    background: rgba(var(--nx-ac), 0.3);
  }
  .clock {
    color: rgba(var(--nx-ac), 0.8);
  }
</style>
