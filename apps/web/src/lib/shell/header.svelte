<script lang="ts">
  import { clock } from '../clock.svelte'
  import { showDoc } from '../docs/docs.svelte'
  import { live } from '../live/stream.svelte'
  import { layout } from '../workspace/layout.svelte'
  import { visibleServices } from '../workspace/prefs.svelte'

  const pad = (n: number): string => String(n).padStart(2, '0')
  const time = $derived(`${pad(clock.now.getHours())}:${pad(clock.now.getMinutes())}:${pad(clock.now.getSeconds())}`)
  const tasks = $derived(live.tasks.length)
  // The newest task's document: it is what the owner wants to look at.
  const openTask = (): void => void showDoc(`task-${live.tasks.at(-1)!.id}`)
  const showHost = $derived(layout.w >= 1180)
  const showServices = $derived(layout.w >= 980)
  const online = $derived(visibleServices().filter((s) => s.status.state === 'online').length)
</script>

<header style:padding-inline={layout.w < 760 ? '0' : '250px'}>
  <span class="brand"><i class="diamond"></i>NOX // NEURAL INTERFACE</span>
  {#if showHost}
    <span class="sep"></span>
    <span>{live.host.name.toUpperCase()}</span>
  {/if}
  {#if showServices}
    <span class="sep"></span>
    <span>SVC {online}/{visibleServices().length}</span>
  {/if}
  {#if live.link === 'offline'}
    <span class="sep"></span>
    <span class="offline"><i></i>RECONNECTING</span>
  {/if}
  {#if tasks > 1}
    <span class="sep"></span>
    <button class="tasks" onclick={openTask} title={live.tasks.map((t) => t.title).join(' · ')}><i></i>{tasks} {tasks === 1 ? 'TASK' : 'TASKS'}</button>
  {/if}
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
    box-sizing: border-box;
    white-space: nowrap;
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
  .tasks {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 4px 9px;
    background: rgba(var(--nx-pn), 0.6);
    border: 1px solid rgba(var(--nx-wn), 0.45);
    border-radius: 999px;
    color: rgb(var(--nx-wn));
    font: inherit;
    letter-spacing: 0.14em;
    cursor: pointer;
    pointer-events: auto;
    animation: nx-sub 0.4s ease both;
  }
  .tasks:hover {
    border-color: rgb(var(--nx-wn));
  }
  .tasks i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: rgb(var(--nx-wn));
    box-shadow: 0 0 6px rgb(var(--nx-wn));
    animation: nx-flash 1.1s ease-in-out infinite;
  }
  .offline {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 4px 9px;
    border: 1px solid rgba(255, 107, 138, 0.5);
    border-radius: 999px;
    color: #ff6b8a;
    letter-spacing: 0.14em;
    animation: nx-sub 0.4s ease both;
  }
  .offline i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #ff6b8a;
    box-shadow: 0 0 6px #ff6b8a;
    animation: nx-flash 1.1s ease-in-out infinite;
  }
  .clock {
    color: rgba(var(--nx-ac), 0.8);
  }
</style>
