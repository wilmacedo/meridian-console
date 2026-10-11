<script lang="ts">
  import type { ModuleDef } from '../modules'
  import { visibleModules } from '../workspace/prefs.svelte'
  import { isOpen, openModule, wm } from '../windows/window-manager.svelte'
  import { viewMode } from '../agent/agent-state.svelte'
  import { clock } from '../clock.svelte'
  import MicButton from './mic-button.svelte'
  import { placedWidgetIds } from '../dock/dock.svelte'
  import { isPhone } from './phone.svelte'
  import { shellUi } from './shell-ui.svelte'

  const listening = $derived(viewMode() === 'listening')
  const modules = $derived(visibleModules())
  const half = $derived(Math.ceil(modules.length / 2))
  const left = $derived(modules.slice(0, half))
  const right = $derived(modules.slice(half))
  const phone = $derived(isPhone())
  const widgets = $derived(placedWidgetIds().length)
  const sheet = $derived(shellUi.sheetOpen && widgets > 0)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const time = $derived(`${pad(clock.now.getHours())}:${pad(clock.now.getMinutes())}`)
  // Core is the screen with no window on it.
  const lit = (m: ModuleDef): boolean => (m.id === 'core' ? !wm.wins.some((w) => !w.closing) : isOpen(m.id))
</script>

{#snippet moduleButton(m: ModuleDef)}
  {@const active = isOpen(m.id)}
  <button class="module" class:active onclick={() => openModule(m.id)}>
    <span>{m.label.toUpperCase()}</span>
    <span class="bar"></span>
  </button>
{/snippet}

{#if phone}
  <div class="pills">
    {#each modules as m (m.id)}
      <button class="pill" class:active={lit(m)} onclick={() => openModule(m.id)}>{m.label.toUpperCase()}</button>
    {/each}
  </div>
{/if}

<nav class:phone>
  <div class="side left" class:away={listening}>
    {#if phone}
      {#if widgets > 0}
        <button class="wpill" class:open={sheet} onclick={() => (shellUi.sheetOpen = !shellUi.sheetOpen)}>
          <span>{sheet ? 'CLOSE' : 'WIDGETS'}</span><b>{pad(widgets)}</b>
        </button>
      {/if}
    {:else}
      {#each left as m (m.id)}{@render moduleButton(m)}{/each}
    {/if}
  </div>
  <MicButton />
  <div class="side right" class:away={listening}>
    {#if phone}
      <span class="time">{time}</span>
    {:else}
      {#each right as m (m.id)}{@render moduleButton(m)}{/each}
    {/if}
  </div>
</nav>

<style>
  nav {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 30px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 26px;
    z-index: 6;
    padding: 0 20px;
  }
  nav.phone {
    bottom: calc(var(--safe-b) + 88px);
    gap: 18px;
    padding: 0 14px;
  }
  .pills {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(var(--safe-b) + 6px);
    z-index: 6;
    display: flex;
    justify-content: safe center;
    gap: 6px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    padding: 2px 14px;
    -webkit-overflow-scrolling: touch;
  }
  .pill {
    flex: none;
    height: 36px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    background: rgba(var(--nx-pn), 0.55);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(var(--nx-ac), 0.2);
    border-radius: 999px;
    color: rgba(var(--nx-ac), 0.55);
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.12em;
    cursor: pointer;
    transition:
      color 0.3s,
      border-color 0.3s,
      background 0.3s;
  }
  .pill.active {
    background: rgba(var(--nx-mu), 0.2);
    border-color: rgba(var(--nx-ac), 0.65);
    color: rgb(var(--nx-fg));
  }
  .wpill {
    flex: none;
    height: 36px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(var(--nx-pn), 0.6);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(var(--nx-ac), 0.28);
    border-radius: 999px;
    color: rgb(var(--nx-ac));
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.16em;
    cursor: pointer;
    transition: border-color 0.25s;
  }
  .wpill.open {
    border-color: rgba(var(--nx-ac), 0.7);
  }
  .wpill b {
    font-weight: 400;
    color: rgb(var(--nx-fg));
  }
  .time {
    display: flex;
    align-items: center;
    height: 36px;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.08em;
    color: rgba(var(--nx-ac), 0.75);
  }
  .side {
    flex: 1;
    display: flex;
    gap: 22px;
    min-width: 0;
  }
  /* The recording capsule opens over the modules beside the mic. */
  .side {
    transition: opacity 0.3s ease;
  }
  .away {
    opacity: 0;
    pointer-events: none;
  }
  .left {
    justify-content: flex-end;
  }
  .right {
    justify-content: flex-start;
  }
  .module {
    background: none;
    border: none;
    padding: 8px 2px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.06em;
    color: rgba(var(--nx-ac), 0.55);
    transition: color 0.3s;
  }
  .module:hover,
  .module.active {
    color: rgb(var(--nx-fg));
  }
  .bar {
    width: 0;
    height: 1px;
    background: rgb(var(--nx-ac));
    box-shadow: 0 0 6px rgb(var(--nx-ac));
    transition: width 0.35s;
  }
  .active .bar {
    width: 100%;
  }
</style>
