<script lang="ts">
  import { appState } from '../state/app-state.svelte'
  import { services } from '../data/services'
  import { buildMetricCards } from './metrics'
  import { buildLogLines } from './logs'

  const selected = $derived(services.find((s) => s.id === appState.svcId) ?? services[0])
  const metrics = $derived(buildMetricCards(appState.series))
  const logs = $derived(buildLogLines(appState.logN))

  const facts = $derived([
    { key: 'IMAGE', value: selected.image },
    { key: 'HOST', value: selected.host },
    { key: 'RESTART', value: 'unless-stopped' },
    { key: 'PORTS', value: '8123→8123/tcp' },
    { key: 'VOLUMES', value: '3 mounted' },
    { key: 'LAST DEPLOY', value: '2026-08-24' },
  ])

  function levelClass(level: string) {
    if (level === 'ERR') return 'err'
    if (level === 'WARN') return 'warn'
    return 'info'
  }

  function backToOverview() {
    appState.screen = 'overview'
    appState.navOpen = false
  }

  function switchService() {
    appState.navOpen = !appState.navOpen
  }
</script>

<div class="panel">
  <div class="head">
    <div>
      <div class="breadcrumb">
        <button type="button" class="link" onclick={backToOverview}>◄ OVERVIEW</button>
        <button type="button" class="switch" onclick={switchService}>SWITCH SERVICE ▾</button>
        <span class="kind-chip">{selected.kind.toUpperCase()}</span>
      </div>
      <div class="title">{selected.name}</div>
      <div class="subtitle">{selected.image} · {selected.host} · UP {selected.uptime}</div>
    </div>
    <div class="actions">
      <button type="button" class="action restart">RESTART</button>
      <button type="button" class="action redeploy">REDEPLOY</button>
      <button type="button" class="action halt">HALT</button>
    </div>
  </div>

  <div class="metrics">
    {#each metrics as metric (metric.label)}
      <div class="metric-card">
        <div class="metric-head">
          <span class="metric-label">{metric.label}</span>
          <span class="metric-value">{metric.value}</span>
        </div>
        <svg viewBox="0 0 200 42" preserveAspectRatio="none">
          <polyline points={metric.area} fill="rgba(47,158,134,.22)" />
          <polyline points={metric.points} fill="none" stroke="rgba(79,214,184,.7)" stroke-width="1.2" />
        </svg>
      </div>
    {/each}
  </div>

  <div class="lower">
    <div class="log-stream">
      <div class="log-head">
        <span class="log-title">LOG STREAM</span>
        <span class="log-dot"></span>
        <span class="log-follow">FOLLOW</span>
      </div>
      <div class="log-body">
        {#each logs as line, i (i)}
          <div class="log-line">
            <span class="log-time">{line.time}</span>
            <span class="log-level {levelClass(line.level)}">{line.level}</span>
            <span class="log-message">{line.message}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="facts">
      <div class="facts-title">CONTAINER</div>
      {#each facts as fact (fact.key)}
        <div class="fact-row">
          <span class="fact-key">{fact.key}</span>
          <span class="fact-value">{fact.value}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .panel {
    padding: 6px 22px 22px;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: rise 0.4s ease both;
  }

  .head {
    flex: none;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 1px solid var(--line-hairline);
    padding-bottom: 14px;
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

  .title {
    font: 600 18px/1.2 var(--font-mono);
    letter-spacing: 0.1em;
    color: var(--text-primary);
  }

  .subtitle {
    font: 500 9px/1.8 var(--font-mono);
    letter-spacing: 0.12em;
    color: var(--text-muted);
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .action {
    all: unset;
    padding: 8px 13px;
    font: 600 9px/1 var(--font-mono);
    letter-spacing: 0.16em;
    cursor: pointer;
    transition: background 0.18s;
    box-sizing: border-box;
  }

  .action.restart {
    border: 1px solid rgba(79, 214, 184, 0.35);
    color: #bfe8dc;
  }

  .action.restart:hover {
    background: rgba(79, 214, 184, 0.14);
  }

  .action.redeploy {
    border: 1px solid rgba(224, 123, 40, 0.45);
    background: rgba(224, 123, 40, 0.1);
    color: #f0b980;
  }

  .action.redeploy:hover {
    background: rgba(224, 123, 40, 0.24);
  }

  .action.halt {
    border: 1px solid rgba(150, 185, 175, 0.25);
    color: rgba(190, 214, 206, 0.7);
  }

  .action.halt:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .metrics {
    flex: none;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }

  .metric-card {
    border: 1px solid var(--line-hairline);
    padding: 12px 14px;
  }

  .metric-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .metric-label {
    font: 600 8.5px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: var(--text-muted);
  }

  .metric-value {
    font: 600 15px/1 var(--font-mono);
    color: var(--text-primary);
  }

  .metric-card svg {
    width: 100%;
    height: 42px;
    margin-top: 10px;
    display: block;
  }

  .lower {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1.7fr 1fr;
    gap: 14px;
    align-items: start;
  }

  .log-stream {
    border: 1px solid var(--line-hairline);
    background: rgba(4, 8, 7, 0.6);
  }

  .log-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line-hairline);
  }

  .log-title {
    font: 600 9px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(200, 228, 220, 0.8);
  }

  .log-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent-teal);
    animation: blink-dot 1.5s ease-in-out infinite;
  }

  .log-follow {
    margin-left: auto;
    font: 500 8.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--text-muted);
  }

  .log-body {
    padding: 10px 14px;
    height: 250px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 2px;
  }

  .log-line {
    display: flex;
    gap: 9px;
    font: 500 10px/1.7 var(--font-mono);
    animation: rise 0.25s ease both;
  }

  .log-time {
    color: rgba(150, 185, 175, 0.3);
  }

  .log-level {
    flex: none;
    color: rgba(79, 214, 184, 0.75);
  }

  .log-level.warn {
    color: var(--accent-amber);
  }

  .log-level.err {
    color: var(--state-err);
  }

  .log-message {
    color: var(--text-body);
  }

  .facts {
    border: 1px solid var(--line-hairline);
    padding: 12px 14px;
  }

  .facts-title {
    font: 600 9px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(200, 228, 220, 0.8);
    margin-bottom: 10px;
  }

  .fact-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 5px 0;
    border-bottom: 1px solid rgba(79, 214, 184, 0.07);
    font: 500 9px/1.7 var(--font-mono);
  }

  .fact-key {
    color: var(--text-muted);
  }

  .fact-value {
    color: rgba(214, 236, 229, 0.85);
    text-align: right;
  }
</style>
