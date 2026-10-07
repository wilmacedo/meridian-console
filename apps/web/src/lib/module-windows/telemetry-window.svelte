<script lang="ts">
  import { uptime } from '../live/format'
  import { live } from '../live/stream.svelte'
  import Sparkline from './sparkline.svelte'

  const last = $derived(live.telemetry.at(-1))
  const hot = (t: number): boolean => t > 70
  const accent = 'rgb(var(--nx-ac))'

  const tiles = $derived([
    { label: 'CPU', value: last ? String(Math.round(last.cpu)) : '—', unit: '%', series: live.telemetry.map((s) => s.cpu), max: 100, color: accent },
    { label: 'MEMORY', value: last ? last.mem.toFixed(1) : '—', unit: `/ ${live.host.memTotalGb.toFixed(0)} GB`, series: live.telemetry.map((s) => s.mem), max: live.host.memTotalGb || 1, color: accent },
    ...(live.telemetry.some((s) => s.temp !== null)
      ? [{ label: 'CORE TEMP', value: last?.temp != null ? String(Math.round(last.temp)) : '—', unit: '°C', series: live.telemetry.map((s) => s.temp ?? 0), max: 100, color: last?.temp != null && hot(last.temp) ? '#ff6b8a' : '#ffd34d' }]
      : []),
    { label: 'NETWORK', value: last ? String(Math.round(last.net)) : '—', unit: 'MB/s', series: live.telemetry.map((s) => s.net), max: Math.max(1, ...live.telemetry.map((s) => s.net)) * 1.2, color: '#bfa8ff' },
  ])
</script>

<div class="tiles">
  {#each tiles as t, i (t.label)}
    <div class="tile glass-card" style:animation-delay="{0.16 + i * 0.07}s">
      <div class="label">{t.label}</div>
      <div class="value"><span class="num">{t.value}</span><span class="unit">{t.unit}</span></div>
      <Sparkline values={t.series} max={t.max} color={t.color} height={36} />
    </div>
  {/each}
</div>

<div class="section">CONTAINERS</div>
<div class="containers">
  {#each live.containers as c (c.name)}
    <div class="crow">
      <span class="cname" title="up {uptime(c.uptimeSec)}">{c.name}</span>
      <div class="bar"><div class="fill" style:width="{Math.min(100, c.cpu)}%"></div></div>
      <span class="cpu">{c.cpu.toFixed(1)}%</span>
      <span class="mem">{Math.round(c.mem)}M</span>
    </div>
  {:else}
    <div class="empty">NO CONTAINERS (IS DOCKER REACHABLE?)</div>
  {/each}
</div>

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 10px;
  }
  .tile {
    padding: 14px 14px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    animation: nx-sub 0.55s ease both;
  }
  .label {
    font: 500 11px/1 var(--font-ui);
    letter-spacing: 0.06em;
    color: rgb(var(--nx-ac));
  }
  .value {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .num {
    font-size: 32px;
    font-weight: 500;
    color: rgb(var(--nx-fg));
  }
  .unit {
    font: 400 11px/1 var(--font-mono);
    color: rgba(var(--nx-ac), 0.7);
  }
  .section {
    margin-top: 18px;
    font: 500 11px/1 var(--font-ui);
    letter-spacing: 0.06em;
    color: rgb(var(--nx-ac));
  }
  .containers {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
  }
  .crow {
    display: grid;
    grid-template-columns: minmax(90px, 140px) minmax(0, 1fr) 56px 64px;
    gap: 14px;
    align-items: center;
    padding: 9px 0;
    border-bottom: 1px solid rgba(var(--nx-ac), 0.1);
    font: 400 12px/1.2 var(--font-mono);
  }
  .cname {
    color: rgb(var(--nx-ac));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar {
    height: 5px;
    border-radius: 3px;
    background: rgba(var(--nx-mu), 0.22);
    position: relative;
    overflow: hidden;
  }
  .fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: linear-gradient(90deg, rgb(var(--nx-mu)), rgb(var(--nx-ac)));
    box-shadow: 0 0 10px rgb(var(--nx-ac));
    border-radius: 3px;
    transform-origin: left;
    transition: width 0.8s ease;
    animation: nx-bar 0.9s var(--ease-out) 0.35s both;
  }
  .cpu {
    color: rgb(var(--nx-fg));
    text-align: right;
  }
  .mem {
    color: rgba(var(--nx-ac), 0.65);
    text-align: right;
  }
  .empty {
    padding: 18px 0;
    text-align: center;
    font-size: 10px;
    letter-spacing: 0.22em;
    color: rgba(var(--nx-ac), 0.5);
  }
</style>
