<script lang="ts">
  import { viewMode } from '../agent/agent-state.svelte'
  import { visibleModules } from '../workspace/prefs.svelte'
  import { switchFx } from '../workspace/switch-fx.svelte'
  import { workspaceCode } from '../workspace/workspace-card'
  import { currentIndex } from '../workspace/workspace-sync.svelte'
  import { close, isOpen, open, openModule, wm } from '../windows/window-manager.svelte'
  import { carGeometry } from './car.svelte'
  import { shellUi } from './shell-ui.svelte'

  const g = $derived(carGeometry())
  const modules = $derived(visibleModules())
  const anyWindow = $derived(wm.wins.some((w) => !w.closing))
  const listening = $derived(viewMode() === 'listening')
  const settingsOpen = $derived(isOpen('settings'))

  function toggleSettings(): void {
    shellUi.workspacesOpen = false
    if (settingsOpen) close('settings')
    else open('settings')
  }
</script>

<div class="bar" style:height="{g.bar}px" style:opacity={switchFx.current || listening ? 0 : 1} style:pointer-events={listening ? 'none' : 'auto'}>
  <button class="square" style:width="{g.bar}px" class:open={shellUi.workspacesOpen} aria-label="Workspaces" onclick={() => (shellUi.workspacesOpen = !shellUi.workspacesOpen)}>
    <span class="diamond"></span>
    <span class="code">{workspaceCode(currentIndex())}</span>
  </button>
  <div class="modules">
    {#each modules as m (m.id)}
      {@const active = m.id === 'core' ? !anyWindow : isOpen(m.id)}
      <button class="module" class:active onclick={() => openModule(m.id)}>
        <span>{m.id === 'core' ? 'HOME' : m.label.toUpperCase()}</span>
        <i></i>
      </button>
    {/each}
  </div>
  <button class="square" style:width="{g.bar}px" class:open={settingsOpen} aria-label="Settings" onclick={toggleSettings}>
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" opacity="0.5" />
      <circle cx="15" cy="7" r="2" fill="rgb(var(--nx-bg))" />
      <circle cx="8" cy="12" r="2" fill="rgb(var(--nx-bg))" />
      <circle cx="13" cy="17" r="2" fill="rgb(var(--nx-bg))" />
    </svg>
  </button>
</div>

<style>
  .bar {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    z-index: 6;
    display: flex;
    align-items: stretch;
    gap: 8px;
    transition: opacity 0.34s ease;
  }
  .square,
  .modules {
    background: rgba(var(--nx-pn), 0.72);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(var(--nx-ac), 0.18);
    border-radius: 14px;
    box-sizing: border-box;
  }
  .square {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0;
    color: rgb(var(--nx-ac));
    cursor: pointer;
    touch-action: manipulation;
    font: 400 12px/1 var(--font-mono);
    transition: border-color 0.25s;
  }
  .square:active {
    transform: scale(0.95);
  }
  .square.open {
    border-color: rgba(var(--nx-ac), 0.6);
  }
  .diamond {
    width: 7px;
    height: 7px;
    border: 1px solid rgba(var(--nx-ac), 0.85);
    transform: rotate(45deg);
  }
  .code {
    letter-spacing: 0.14em;
    color: rgb(var(--nx-fg));
  }
  .modules {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 4px;
    padding: 5px;
  }
  .module {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 10px;
    color: rgb(var(--nx-ac));
    cursor: pointer;
    touch-action: manipulation;
    font: 400 12px/1 var(--font-mono);
    letter-spacing: 0.14em;
    transition:
      background 0.25s,
      border-color 0.25s,
      color 0.25s;
  }
  .module:active {
    transform: scale(0.97);
  }
  .module.active {
    background: rgba(var(--nx-mu), 0.2);
    border-color: rgba(var(--nx-ac), 0.5);
    color: rgb(var(--nx-fg));
  }
  .module span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .module i {
    position: absolute;
    left: 50%;
    bottom: 8px;
    width: 0;
    height: 1px;
    transform: translateX(-50%);
    background: rgb(var(--nx-ac));
    transition: width 0.35s;
  }
  .module.active i {
    width: 22px;
  }
</style>
