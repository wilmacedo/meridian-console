<script lang="ts">
  import { appState } from '../state/app-state.svelte'
  import { registry } from '../services/registry.svelte'
  import { selectedService } from '../services/selection'
  import { filterServiceGroups } from './services-dropdown'

  const groups = $derived(filterServiceGroups(registry.services, appState.svcQ))
  const selectedId = $derived(selectedService()?.id)

  function selectService(id: string) {
    appState.screen = 'service'
    appState.svcId = id
    appState.navOpen = false
  }

  function stateClass(state: string) {
    if (state === 'err') return 'err'
    if (state === 'warn') return 'warn'
    return 'ok'
  }
</script>

<div class="dropdown">
  <div class="dropdown-head">
    <span class="eyebrow">{registry.services.length} SERVICES</span>
    <input
      class="filter"
      placeholder="filter…"
      value={appState.svcQ}
      oninput={(e) => (appState.svcQ = e.currentTarget.value)}
    />
    <button type="button" class="close" onclick={() => (appState.navOpen = false)} aria-label="Close">✕</button>
  </div>

  <div class="dropdown-body">
    {#each groups as group (group.host)}
      <div>
        <div class="group-head">{group.host}</div>
        {#each group.items as sv (sv.id)}
          <button type="button" class="row" class:selected={sv.id === selectedId} onclick={() => selectService(sv.id)}>
            <span class="dot {stateClass(sv.status.state)}"></span>
            <span class="name" class:selected={sv.id === selectedId}>{sv.name}</span>
            <span class="tag {stateClass(sv.status.state)}">{sv.tag}</span>
            <span class="cpu">{sv.status.state.toUpperCase()}</span>
          </button>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .dropdown {
    position: absolute;
    top: 30px;
    left: 120px;
    width: 330px;
    z-index: 40;
    border: 1px solid rgba(79, 214, 184, 0.35);
    background: var(--bg-panel-solid);
    box-shadow: 0 30px 70px -18px #000;
  }

  .dropdown-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border-bottom: 1px solid var(--line-hairline);
  }

  .eyebrow {
    font: 600 8px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(150, 185, 175, 0.5);
    white-space: nowrap;
  }

  .filter {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    outline: none;
    text-align: right;
    font: 500 9.5px/1 var(--font-mono);
    color: #dff0eb;
  }

  .filter::placeholder {
    color: rgba(150, 185, 175, 0.35);
  }

  .close {
    all: unset;
    font: 500 11px/1 var(--font-mono);
    color: rgba(160, 196, 187, 0.5);
    cursor: pointer;
  }

  .dropdown-body {
    max-height: 330px;
    overflow-y: auto;
  }

  .group-head {
    padding: 7px 12px;
    background: rgba(79, 214, 184, 0.05);
    font: 600 7.5px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(150, 185, 175, 0.55);
  }

  .row {
    all: unset;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 9px 1fr 62px 40px;
    gap: 10px;
    align-items: center;
    width: 100%;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line-row);
    cursor: pointer;
    background: transparent;
    transition: background 0.15s;
  }

  .row:hover {
    background: rgba(79, 214, 184, 0.06);
  }

  .row.selected {
    background: rgba(79, 214, 184, 0.1);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent-teal);
    box-shadow: 0 0 8px var(--accent-teal);
  }

  .dot.warn {
    background: var(--accent-amber);
    box-shadow: 0 0 8px var(--accent-amber);
  }

  .dot.err {
    background: var(--state-err);
    box-shadow: 0 0 8px var(--state-err);
  }

  .name {
    font: 500 10.5px/1.4 var(--font-mono);
    letter-spacing: 0.06em;
    color: rgba(200, 228, 220, 0.8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name.selected {
    font-weight: 600;
    color: var(--text-primary);
  }

  .tag {
    font: 500 7.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    opacity: 0.85;
    text-align: right;
    color: var(--accent-teal);
  }

  .tag.warn {
    color: var(--accent-amber);
  }

  .tag.err {
    color: var(--state-err);
  }

  .cpu {
    font: 500 8.5px/1 var(--font-mono);
    color: var(--text-muted);
    text-align: right;
  }
</style>
