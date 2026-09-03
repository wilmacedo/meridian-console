<script lang="ts">
  import { appState } from '../state/app-state.svelte'

  const gaugeDefs = [
    { label: 'SYSTEM POWER', amber: false },
    { label: 'STABILITY', amber: false },
    { label: 'LOAD STATUS', amber: true },
  ]

  const matrix = $derived(
    Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 7 }, (_, c) => {
        const k = r * 7 + c
        const active = (k * 7 + appState.tick) % 11 < 3
        return {
          key: k,
          n: String(100 + (k % 20)),
          active,
          duration: 2.4 + (k % 5) * 0.4,
          delay: (k % 7) * 0.2,
        }
      }),
    ),
  )

  const gauges = $derived(gaugeDefs.map((def, i) => ({ ...def, value: Math.round(appState.gauge[i]) })))

  const ladderDots = $derived(
    Array.from({ length: 11 }, (_, i) => i === Math.round((100 - appState.gauge[1]) / 10)),
  )
</script>

<aside>
  <div class="matrix">
    {#each matrix as row, r (r)}
      <div class="matrix-row">
        {#each row as cell (cell.key)}
          <div class="matrix-cell">
            <div
              class="matrix-box"
              class:active={cell.active}
              style:animation-duration={`${cell.duration}s`}
              style:animation-delay={`${cell.delay}s`}
            >
              <div class="matrix-inner"></div>
            </div>
            <div class="matrix-n">{cell.n}</div>
          </div>
        {/each}
      </div>
    {/each}
  </div>

  <div class="telemetry">
    <div class="gauges">
      {#each gauges as gauge (gauge.label)}
        <div class="gauge-row">
          <div class="gauge-label">
            <div class="gauge-name">{gauge.label}</div>
            <div class="gauge-value" class:amber={gauge.amber}>{gauge.value}%</div>
          </div>
          <div class="gauge-pointer"></div>
          <div class="gauge-track">
            <div class="gauge-fill" class:amber={gauge.amber} style:height={`${gauge.value}%`}></div>
            <div class="gauge-ruling"></div>
          </div>
        </div>
      {/each}
    </div>
    <div class="ladder">
      {#each ladderDots as active, i (i)}
        <div class="ladder-dot" class:active style:top={`${i * 10}%`}></div>
      {/each}
    </div>
    <div class="scale">
      {#each ['100', '90', '80', '70', '60', '50', '40', '30', '20', '10', '00'] as n}
        <span>{n}</span>
      {/each}
    </div>
  </div>
</aside>

<style>
  aside {
    padding: 16px 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
    overflow-y: auto;
  }

  .matrix-row {
    display: flex;
    gap: 5px;
    margin-bottom: 5px;
  }

  .matrix-cell {
    width: 26px;
  }

  .matrix-box {
    position: relative;
    height: 20px;
    border: 1px solid rgba(79, 214, 184, 0.16);
    background: rgba(79, 214, 184, 0.02);
    overflow: hidden;
    animation-name: flicker;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
  }

  .matrix-box.active {
    border-color: rgba(79, 214, 184, 0.4);
    background: rgba(79, 214, 184, 0.08);
  }

  .matrix-inner {
    position: absolute;
    inset: 3px;
    background: repeating-linear-gradient(180deg, rgba(79, 214, 184, 0.5) 0 1px, transparent 1px 4px);
  }

  .matrix-box.active .matrix-inner {
    inset: 2px;
    background:
      linear-gradient(45deg, transparent 46%, var(--accent-teal) 46%, var(--accent-teal) 54%, transparent 54%),
      linear-gradient(-45deg, transparent 46%, var(--accent-teal) 46%, var(--accent-teal) 54%, transparent 54%);
    opacity: 0.55;
  }

  .matrix-n {
    font: 500 6.5px/1.6 var(--font-mono);
    color: var(--text-muted);
    text-align: center;
  }

  .telemetry {
    display: flex;
    gap: 10px;
    flex: 1;
    min-height: 270px;
  }

  .gauges {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .gauge-row {
    flex: 1;
    display: flex;
    align-items: stretch;
    gap: 8px;
  }

  .gauge-label {
    width: 60px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-end;
    gap: 5px;
  }

  .gauge-name {
    font: 600 8px/1.4 var(--font-mono);
    letter-spacing: 0.14em;
    color: rgba(190, 214, 206, 0.75);
    text-align: right;
  }

  .gauge-value {
    font: 600 11px/1 var(--font-mono);
    color: var(--accent-teal);
  }

  .gauge-value.amber {
    color: var(--accent-amber);
  }

  .gauge-pointer {
    width: 0;
    height: 0;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    border-left: 5px solid rgba(190, 214, 206, 0.6);
    align-self: center;
  }

  .gauge-track {
    flex: 1;
    position: relative;
    border: 1px solid var(--line-hairline);
    background: rgba(79, 214, 184, 0.04);
    display: flex;
    align-items: flex-end;
  }

  .gauge-fill {
    width: 100%;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--accent-teal) 80%, transparent),
      color-mix(in srgb, var(--accent-teal) 33%, transparent)
    );
    transition: height 1s ease;
  }

  .gauge-fill.amber {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--accent-amber) 80%, transparent),
      color-mix(in srgb, var(--accent-amber) 33%, transparent)
    );
  }

  .gauge-ruling {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(180deg, transparent 0 9px, rgba(5, 7, 6, 0.55) 9px 10px);
  }

  .ladder {
    width: 16px;
    position: relative;
    border-left: 1px solid var(--line-hairline);
  }

  .ladder-dot {
    position: absolute;
    right: 2px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(160, 196, 187, 0.3);
    transition: background 0.6s;
  }

  .ladder-dot.active {
    background: var(--accent-amber);
  }

  .scale {
    width: 24px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font: 500 8px/1 var(--font-mono);
    color: var(--text-muted);
    text-align: right;
  }
</style>
