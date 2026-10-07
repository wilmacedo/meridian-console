<script lang="ts">
  import { onMount } from 'svelte'
  import { consoleState, startPacketFeed, stopPacketFeed, clearFeed } from './console-state.svelte'
  import { filterFeed, findSelected } from './derived'
  import PacketLogTable from './packet-log-table.svelte'
  import PacketInspector from './packet-inspector.svelte'

  // Ticks once a second so the rate decays back to 0.0 when traffic stops, instead of freezing.
  let now = $state(Date.now())

  const levelDefs = ['PKT', 'INFO', 'WARN', 'ERR', 'DROP'] as const
  const channelDefs: [string, string][] = [
    ['chat', 'chat'],
    ['zm', 'zone'],
    ['srv', 'server'],
    ['sys', 'runtime'],
  ]

  const shown = $derived(filterFeed(consoleState.feed, consoleState.lvlOff, consoleState.chanOff, consoleState.q))
  const selectedPacket = $derived(findSelected(consoleState.feed, shown, consoleState.packetSel))
  // Real rolling rate over the trailing 5s.
  const feedRate = $derived.by(() => {
    const cutoff = now - 5_000
    const recent = consoleState.feed.filter((entry) => entry.epochMs >= cutoff).length
    return (recent / 5).toFixed(1)
  })

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

  onMount(() => {
    startPacketFeed()
    const clock = setInterval(() => (now = Date.now()), 1000)
    return () => {
      stopPacketFeed()
      clearInterval(clock)
    }
  })
</script>

<div class="panel">
  <div class="head">
    <div>
      <div class="title-row">
        <div class="socket-chip" class:down={!consoleState.connected}>
          {consoleState.connected ? 'SOCKET OPEN' : 'SOCKET CLOSED'}
        </div>
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
      <span class="match-count">{shown.length} MATCH</span>
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
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: nx-sub 0.4s ease both;
  }

  .head {
    flex: none;
    flex-wrap: wrap;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 1px solid rgba(var(--nx-ac), 0.16);
    padding-bottom: 12px;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .socket-chip {
    white-space: nowrap;
    padding: 2px 7px;
    border: 1px solid rgba(var(--nx-ac), 0.4);
    font: 600 7.5px/1.6 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgb(var(--nx-fg));
  }

  .socket-chip.down {
    border-color: color-mix(in srgb, #ff6b8a 47%, transparent);
    color: #ff6b8a;
  }

  .subtitle {
    font: 500 9px/1.8 var(--font-mono);
    letter-spacing: 0.12em;
    color: rgba(var(--nx-ac), 0.55);
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
    border: 1px solid rgba(var(--nx-ac), 0.18);
    color: rgba(var(--nx-ac), 0.45);
  }

  .decode.active {
    border-color: rgba(var(--nx-ac), 0.5);
    background: rgba(var(--nx-ac), 0.12);
    color: rgb(var(--nx-fg));
  }

  .follow.active {
    border-color: rgba(255, 211, 77, 0.5);
    background: rgba(255, 211, 77, 0.1);
    color: #ffd34d;
  }

  .follow-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: rgba(var(--nx-ac), 0.35);
  }

  .follow-dot.active {
    background: #ffd34d;
    animation: nx-blink 1.2s ease-in-out infinite;
  }

  .clear:hover {
    background: rgba(var(--nx-hi), 0.04);
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
    border: 1px solid rgba(var(--nx-ac), 0.2);
    background: rgba(var(--nx-ac), 0.03);
  }

  .search-glyph {
    font: 600 9px/1 var(--font-mono);
    color: rgba(var(--nx-ac), 0.6);
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
    color: rgb(var(--nx-fg));
  }

  .search input::placeholder {
    color: rgba(var(--nx-ac), 0.35);
  }

  .match-count {
    font: 500 8px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: rgba(var(--nx-ac), 0.55);
    white-space: nowrap;
  }

  .level-chip {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    border: 1px solid rgba(var(--nx-ac), 0.16);
    font: 600 8.5px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: rgba(var(--nx-ac), 0.4);
    cursor: pointer;
    transition: all 0.18s;
  }

  .level-chip .chip-count {
    font: 500 8px/1 var(--font-mono);
    opacity: 0.7;
  }

  .level-chip.on.lvl-pkt {
    border-color: color-mix(in srgb, rgb(var(--nx-ac)) 47%, transparent);
    background: color-mix(in srgb, rgb(var(--nx-ac)) 9%, transparent);
    color: rgb(var(--nx-ac));
  }

  .level-chip.on.lvl-info {
    border-color: rgba(var(--nx-ac), 0.53);
    background: rgba(var(--nx-ac), 0.09);
    color: rgba(var(--nx-ac), 0.85);
  }

  .level-chip.on.lvl-warn {
    border-color: color-mix(in srgb, #ffd34d 47%, transparent);
    background: color-mix(in srgb, #ffd34d 9%, transparent);
    color: #ffd34d;
  }

  .level-chip.on.lvl-err {
    border-color: color-mix(in srgb, #ff6b8a 47%, transparent);
    background: color-mix(in srgb, #ff6b8a 9%, transparent);
    color: #ff6b8a;
  }

  .level-chip.on.lvl-drop {
    border-color: rgba(var(--nx-ac), 0.3);
    background: rgba(var(--nx-ac), 0.06);
    color: rgba(var(--nx-ac), 0.45);
  }

  .divider {
    width: 1px;
    height: 22px;
    background: rgba(var(--nx-ac), 0.16);
  }

  .channel-chip {
    all: unset;
    box-sizing: border-box;
    padding: 5px 9px;
    border: 1px solid rgba(var(--nx-ac), 0.16);
    font: 500 8.5px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: rgba(var(--nx-ac), 0.4);
    cursor: pointer;
    transition: all 0.18s;
  }

  .channel-chip.on {
    border-color: rgba(var(--nx-ac), 0.45);
    color: rgb(var(--nx-fg));
  }

  .body-grid {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: flex-start;
  }
</style>
