<script lang="ts">
  import { onMount } from 'svelte'
  import { appState } from '../state/app-state.svelte'
  import { services } from '../data/services'
  import { consoleState, startPacketFeed, stopPacketFeed, clearFeed } from './console-state.svelte'
  import { filterFeed, findSelected } from './derived'
  import PacketLogTable from './packet-log-table.svelte'
  import PacketInspector from './packet-inspector.svelte'

  const selected = $derived(services.find((s) => s.id === appState.svcId) ?? services[0])

  const levelDefs = ['PKT', 'INFO', 'WARN', 'ERR', 'DROP'] as const
  const channelDefs: [string, string][] = [
    ['zm', 'zone'],
    ['srv', 'server'],
    ['sys', 'runtime'],
  ]

  const kept = $derived(filterFeed(consoleState.feed, consoleState.lvlOff, consoleState.chanOff, consoleState.q))
  const shown = $derived(kept.slice(-60))
  const selectedPacket = $derived(findSelected(consoleState.feed, shown, consoleState.packetSel))
  const feedRate = $derived((0.9 + Math.abs(Math.sin(appState.tick / 4)) * 0.7).toFixed(1))

  const levelChips = $derived(
    levelDefs.map((lvl) => ({
      lvl,
      on: !consoleState.lvlOff[lvl],
      count: consoleState.feed.filter((l) => l.lvl === lvl).length,
    })),
  )

  const channelChips = $derived(channelDefs.map(([key, label]) => ({ key, label, on: !consoleState.chanOff[key] })))

  function toggleLevel(lvl: string) {
    consoleState.lvlOff = { ...consoleState.lvlOff, [lvl]: !consoleState.lvlOff[lvl] }
  }

  function toggleChannel(key: string) {
    consoleState.chanOff = { ...consoleState.chanOff, [key]: !consoleState.chanOff[key] }
  }

  function setQuery(value: string) {
    consoleState.q = value
    consoleState.packetSel = 0
  }

  function pick(id: number) {
    consoleState.packetSel = id
  }

  function backToOverview() {
    appState.screen = 'overview'
    appState.navOpen = false
  }

  function switchService() {
    appState.navOpen = !appState.navOpen
  }

  onMount(() => {
    startPacketFeed()
    return () => stopPacketFeed()
  })
</script>

<div class="panel">
  <div class="head">
    <div>
      <div class="breadcrumb">
        <button type="button" class="link" onclick={backToOverview}>◄ OVERVIEW</button>
        <button type="button" class="switch" onclick={switchService}>SWITCH SERVICE ▾</button>
        <span class="kind-chip">{selected.kind.toUpperCase()}</span>
      </div>
      <div class="title-row">
        <div class="title">{selected.name}</div>
        <div class="socket-chip">SOCKET OPEN</div>
      </div>
      <div class="subtitle">console stream · smartfox packet bus · {feedRate} msg/s · {consoleState.feed.length} buffered</div>
    </div>
    <div class="actions">
      <button type="button" class="decode" class:active={consoleState.decode} onclick={() => (consoleState.decode = !consoleState.decode)}>
        DECODE %XX
      </button>
      <button type="button" class="follow" class:active={consoleState.follow} onclick={() => (consoleState.follow = !consoleState.follow)}>
        <span class="follow-dot" class:active={consoleState.follow}></span>FOLLOW
      </button>
      <button type="button" class="clear" onclick={clearFeed}>CLEAR</button>
    </div>
  </div>

  <div class="filter-bar">
    <div class="search">
      <span class="search-glyph">/</span>
      <input
        placeholder="filter decoded text · e.g. getDrop, restart, hp"
        value={consoleState.q}
        oninput={(e) => setQuery(e.currentTarget.value)}
      />
      <span class="match-count">{kept.length} MATCH</span>
    </div>

    {#each levelChips as chip (chip.lvl)}
      <button type="button" class="level-chip lvl-{chip.lvl.toLowerCase()}" class:on={chip.on} onclick={() => toggleLevel(chip.lvl)}>
        {chip.lvl}<span class="chip-count">{chip.count}</span>
      </button>
    {/each}

    <div class="divider"></div>

    {#each channelChips as chip (chip.key)}
      <button type="button" class="channel-chip" class:on={chip.on} onclick={() => toggleChannel(chip.key)}>
        {chip.label}
      </button>
    {/each}
  </div>

  <div class="body-grid">
    <PacketLogTable rows={shown} selectedId={selectedPacket.id} decode={consoleState.decode} onPick={pick} />
    <PacketInspector packet={selectedPacket} />
  </div>
</div>

<style>
  .panel {
    padding: 6px 22px 22px;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: rise 0.4s ease both;
  }

  .head {
    flex: none;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 1px solid var(--line-hairline);
    padding-bottom: 12px;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 5px;
  }

  .link {
    all: unset;
    font: 500 8.5px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgba(160, 196, 187, 0.5);
    cursor: pointer;
    transition: color 0.15s;
  }

  .link:hover {
    color: #8fe8d4;
  }

  .switch {
    all: unset;
    padding: 4px 8px;
    border: 1px solid rgba(79, 214, 184, 0.3);
    font: 600 8px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: #bfe8dc;
    cursor: pointer;
    transition: background 0.15s;
  }

  .switch:hover {
    background: rgba(79, 214, 184, 0.14);
  }

  .kind-chip {
    padding: 4px 8px;
    border: 1px solid rgba(224, 123, 40, 0.35);
    font: 600 8px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: #f0b980;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .title {
    font: 600 16px/1.2 var(--font-mono);
    letter-spacing: 0.1em;
    color: var(--text-primary);
  }

  .socket-chip {
    padding: 2px 7px;
    border: 1px solid rgba(79, 214, 184, 0.4);
    font: 600 7.5px/1.6 var(--font-mono);
    letter-spacing: 0.16em;
    color: #8fe8d4;
  }

  .subtitle {
    font: 500 9px/1.8 var(--font-mono);
    letter-spacing: 0.12em;
    color: var(--text-muted);
  }

  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex: none;
  }

  .actions button {
    all: unset;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 10px;
    font: 600 8.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    cursor: pointer;
    transition: all 0.18s;
    box-sizing: border-box;
    border: 1px solid rgba(160, 196, 187, 0.18);
    color: rgba(160, 196, 187, 0.45);
  }

  .decode.active {
    border-color: rgba(79, 214, 184, 0.5);
    background: rgba(79, 214, 184, 0.12);
    color: var(--text-primary);
  }

  .follow.active {
    border-color: rgba(224, 123, 40, 0.5);
    background: rgba(224, 123, 40, 0.1);
    color: #f0b980;
  }

  .follow-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: rgba(160, 196, 187, 0.35);
  }

  .follow-dot.active {
    background: var(--accent-amber);
    animation: blink-dot 1.2s ease-in-out infinite;
  }

  .clear:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .filter-bar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 220px;
    padding: 0 10px;
    border: 1px solid rgba(79, 214, 184, 0.2);
    background: rgba(79, 214, 184, 0.03);
  }

  .search-glyph {
    font: 600 9px/1 var(--font-mono);
    color: rgba(79, 214, 184, 0.6);
  }

  .search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    outline: none;
    padding: 9px 0;
    font: 500 10px/1 var(--font-mono);
    letter-spacing: 0.06em;
    color: #dff0eb;
  }

  .search input::placeholder {
    color: rgba(150, 185, 175, 0.35);
  }

  .match-count {
    font: 500 8px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .level-chip {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    border: 1px solid rgba(160, 196, 187, 0.16);
    font: 600 8.5px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: rgba(160, 196, 187, 0.4);
    cursor: pointer;
    transition: all 0.18s;
  }

  .level-chip .chip-count {
    font: 500 8px/1 var(--font-mono);
    opacity: 0.7;
  }

  .level-chip.on.lvl-pkt {
    border-color: color-mix(in srgb, var(--accent-teal) 47%, transparent);
    background: color-mix(in srgb, var(--accent-teal) 9%, transparent);
    color: var(--accent-teal);
  }

  .level-chip.on.lvl-info {
    border-color: rgba(160, 196, 187, 0.53);
    background: rgba(160, 196, 187, 0.09);
    color: rgba(160, 196, 187, 0.85);
  }

  .level-chip.on.lvl-warn {
    border-color: color-mix(in srgb, var(--accent-amber) 47%, transparent);
    background: color-mix(in srgb, var(--accent-amber) 9%, transparent);
    color: var(--accent-amber);
  }

  .level-chip.on.lvl-err {
    border-color: color-mix(in srgb, var(--state-err) 47%, transparent);
    background: color-mix(in srgb, var(--state-err) 9%, transparent);
    color: var(--state-err);
  }

  .level-chip.on.lvl-drop {
    border-color: rgba(160, 196, 187, 0.3);
    background: rgba(160, 196, 187, 0.06);
    color: rgba(160, 196, 187, 0.45);
  }

  .divider {
    width: 1px;
    height: 22px;
    background: var(--line-hairline);
  }

  .channel-chip {
    all: unset;
    box-sizing: border-box;
    padding: 5px 9px;
    border: 1px solid rgba(160, 196, 187, 0.16);
    font: 500 8.5px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: rgba(160, 196, 187, 0.4);
    cursor: pointer;
    transition: all 0.18s;
  }

  .channel-chip.on {
    border-color: rgba(79, 214, 184, 0.45);
    color: #cfeae2;
  }

  .body-grid {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
</style>
