<script lang="ts">
  import { appState } from '../state/app-state.svelte'
  import { selectedService } from '../services/selection'

  const hexRows = ['112 - 9453 - 2592 - DE', '3857 - 3452 - 2397 - 5342', '0093 - 4828 - 8425 - 2084']

  function lastOf(values: number[]) {
    return values[values.length - 1]
  }

  const selected = $derived(selectedService())
  const analysisId = $derived(` / ${20 + (appState.tick % 9)} · 45`)

  const stateLabel = { ok: 'UP', warn: 'WARN', err: 'DOWN' } as const

  const containerInfo = $derived(
    selected
      ? [
          { label: 'Service:', value: selected.name, amber: false },
          { label: 'Kind:', value: selected.kind, amber: false },
          { label: 'Status:', value: stateLabel[selected.status.state], amber: selected.status.state !== 'ok' },
          { label: 'Host:', value: selected.host, amber: false },
          ...(selected.status.facts ?? []).slice(0, 2).map((fact) => ({ label: `${fact.label}:`, value: fact.value, amber: false })),
        ]
      : [],
  )

  const hostBars = $derived([
    { label: 'Memory:', pct: Math.round(lastOf(appState.series.b)) },
    { label: 'Storage:', pct: 74 },
    { label: 'CPU  62.8%', pct: Math.round(lastOf(appState.series.a)) },
  ])

  const microBars = $derived(Array.from({ length: 22 }, (_, i) => 18 + Math.abs(Math.sin(i * 1.1 + appState.tick / 5)) * 38))
</script>

<aside>
  <div>
    <div class="analysis-badge">ANALYSIS<span class="analysis-id">{analysisId}</span></div>
    <div class="rule"></div>
    {#each hexRows as row}
      <div class="hex-row">{row}</div>
    {/each}
  </div>

  <div class="panel">
    <div class="panel-title">Service Info</div>
    <div class="rule"></div>
    {#each containerInfo as row}
      <div class="kv-row">
        <span class="kv-key">{row.label}</span>
        <span class="kv-value" class:amber={row.amber}>{row.value}</span>
      </div>
    {/each}
    <div class="panel-subtitle">Containers</div>
    <div class="container-graphic">
      <div class="block block-fill"></div>
      <div class="block block-outline"></div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-title">Host</div>
    <div class="rule"></div>
    <div class="kv-row">
      <span class="kv-key">IP:</span>
      <span class="kv-value">23.54.75.23</span>
    </div>
    {#each hostBars as bar}
      <div class="bar-row">
        <div class="bar-label">{bar.label}</div>
        <div class="bar-track">
          <div class="bar-fill" style:width={`${bar.pct}%`}></div>
        </div>
      </div>
    {/each}
    <div class="micro-bars">
      {#each microBars as height}
        <div class="micro-bar" style:height={`${height}%`}></div>
      {/each}
    </div>
  </div>
</aside>

<style>
  aside {
    padding: 18px 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
    overflow-y: auto;
  }

  .analysis-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 3px 8px;
    background: var(--accent-amber);
    color: #120a04;
    font: 700 9px/1.5 var(--font-mono);
    letter-spacing: 0.22em;
  }

  .analysis-id {
    opacity: 0.7;
  }

  .rule {
    height: 1px;
    background: var(--line-hairline);
    margin: 10px 0 8px;
  }

  .hex-row {
    font: 500 8.5px/1.9 var(--font-mono);
    letter-spacing: 0.1em;
    color: var(--text-muted);
  }

  .panel {
    border: 1px solid var(--line-hairline);
    padding: 12px 13px;
  }

  .panel-title {
    font: 600 9.5px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgba(200, 228, 220, 0.85);
  }

  .panel-subtitle {
    font: 600 9px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: rgba(200, 228, 220, 0.7);
    margin: 12px 0 8px;
  }

  .kv-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font: 500 9px/2 var(--font-mono);
  }

  .kv-key {
    flex: none;
    color: var(--text-muted);
  }

  .kv-value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(214, 236, 229, 0.9);
  }

  .kv-value.amber {
    color: var(--accent-amber);
  }

  .container-graphic {
    position: relative;
    height: 64px;
    perspective: 420px;
  }

  .block {
    position: absolute;
    left: 8px;
    top: 16px;
    width: 150px;
    height: 34px;
    transform: rotateX(62deg) rotateZ(-42deg);
  }

  .block-fill {
    background: linear-gradient(135deg, var(--accent-amber), rgba(224, 123, 40, 0.35));
    box-shadow: 0 10px 24px -8px rgba(224, 123, 40, 0.7);
  }

  .block-outline {
    left: 14px;
    top: 26px;
    border: 1px solid rgba(224, 123, 40, 0.45);
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 7px;
  }

  .bar-label {
    width: 52px;
    font: 500 9px/1 var(--font-mono);
    color: var(--text-muted);
  }

  .bar-track {
    flex: 1;
    height: 6px;
    background: rgba(79, 214, 184, 0.1);
  }

  .bar-fill {
    height: 100%;
    background: var(--accent-teal);
    opacity: 0.75;
    transition: width 0.8s ease;
  }

  .micro-bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 56px;
    margin-top: 14px;
  }

  .micro-bar {
    flex: 1;
    background: rgba(79, 214, 184, 0.44);
    transition: height 0.9s ease;
  }

  .micro-bar:nth-child(4n + 1) {
    background: rgba(79, 214, 184, 0.3);
  }
  .micro-bar:nth-child(4n + 2) {
    background: rgba(79, 214, 184, 0.44);
  }
  .micro-bar:nth-child(4n + 3) {
    background: rgba(79, 214, 184, 0.58);
  }
  .micro-bar:nth-child(4n) {
    background: rgba(79, 214, 184, 0.72);
  }
</style>
