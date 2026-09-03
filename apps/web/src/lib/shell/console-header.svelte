<script lang="ts">
  import { appState, type Screen } from '../state/app-state.svelte'

  const navItems: { id: Screen; label: string }[] = [
    { id: 'overview', label: 'System Overview' },
    { id: 'service', label: 'Services' },
    { id: 'home', label: 'Habitat' },
    { id: 'endpoints', label: 'Endpoints' },
    { id: 'automations', label: 'Protocols' },
  ]

  function selectNav(id: Screen) {
    // The Services nav item only toggles the dropdown — it must never navigate on its own,
    // see docs/design-handoff.md#known-pitfalls-already-hit-in-this-design.
    if (id === 'service') {
      appState.navOpen = !appState.navOpen
      return
    }
    appState.screen = id
    appState.navOpen = false
  }
</script>

<header>
  <div class="wordmark">MERIDIAN</div>
  <nav>
    {#each navItems as item (item.id)}
      <button type="button" class:active={appState.screen === item.id} onclick={() => selectNav(item.id)}>
        {item.label}{item.id === 'service' ? '  ▾' : ''}
      </button>
    {/each}
  </nav>
  <div class="spacer"></div>
  <div class="clock">{appState.clock} UTC</div>
  <div class="leds">
    <span class="led led-teal"></span>
    <span class="led led-amber"></span>
    <span class="led led-off"></span>
  </div>
</header>

<style>
  header {
    position: relative;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 34px;
    padding: 16px 22px 12px;
    background: #070c0b;
  }

  .wordmark {
    font: 700 15px/1 var(--font-mono);
    letter-spacing: 0.42em;
    color: var(--text-primary);
  }

  nav {
    display: flex;
    gap: 22px;
    align-items: center;
  }

  nav button {
    all: unset;
    font: 500 10.5px/1.6 var(--font-mono);
    letter-spacing: 0.1em;
    cursor: pointer;
    padding-bottom: 3px;
    border-bottom: 1px solid transparent;
    color: rgba(160, 196, 187, 0.5);
    transition: all 0.2s;
  }

  nav button.active {
    border-bottom-color: var(--accent-teal);
    color: var(--text-primary);
  }

  .spacer {
    flex: 1;
  }

  .clock {
    font: 500 9.5px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(150, 185, 175, 0.5);
  }

  .leds {
    display: flex;
    gap: 5px;
  }

  .led {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }

  .led-teal {
    background: var(--accent-teal);
    animation: blink-dot 2.2s ease-in-out infinite;
  }

  .led-amber {
    background: var(--accent-amber);
  }

  .led-off {
    background: rgba(150, 185, 175, 0.3);
  }
</style>
