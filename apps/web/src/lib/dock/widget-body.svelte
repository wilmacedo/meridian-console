<script lang="ts">
  import DocBlocks from '../docs/doc-blocks.svelte'
  import { eventsFor } from '../live/events-view.svelte'
  import { clockTime, LEVEL_COLOR } from '../live/format'
  import { live } from '../live/stream.svelte'
  import Sparkline from '../module-windows/sparkline.svelte'
  import { contributedWidget } from '../services/service-ui'
  import type { WidgetDef } from './widgets'

  let { def }: { def: WidgetDef } = $props()

  const STATUS = { online: ['ONLINE', 'rgb(var(--nx-ac))'], degraded: ['DEGRADED', '#ffd34d'], offline: ['OFFLINE', '#ff6b8a'] } as const
</script>

{#if def.type === 'doc' && def.blocks}
  <DocBlocks blocks={def.blocks} compact />
{:else if def.type === 'services'}
  <div class="svcs">
    {#each live.services as s (s.id)}
      {@const [label, color] = STATUS[s.status.state]}
      <div class="svc">
        <span class="dot" style:background={color} style:box-shadow="0 0 6px {color}"></span>
        <span class="name">{s.name}</span>
        <span class="state" style:color>{label}</span>
      </div>
    {/each}
  </div>
{:else if def.type === 'logs'}
  {@const rows = eventsFor(def.svc ?? 'all').slice(0, 6)}
  <div class="logs">
    {#each rows as e (e.id)}
      <div class="log">
        <span class="ts">{clockTime(e.ts)}</span>
        <span class="lvl" style:color={LEVEL_COLOR[e.level]}>{e.level.toUpperCase()}</span>
        <span class="msg">{def.svc === 'all' ? `${e.source} · ${e.message}` : e.message}</span>
      </div>
    {:else}
      <div class="empty">NO EVENTS YET</div>
    {/each}
  </div>
{:else if def.type === 'tele'}
  {@const recent = live.telemetry.slice(-32)}
  {@const last = recent.at(-1)}
  {@const rows = [
    { label: 'CPU', value: last ? String(Math.round(last.cpu)) : '—', unit: '%', series: recent.map((s) => s.cpu), max: 100, color: 'rgb(var(--nx-ac))' },
    { label: 'MEM', value: last ? last.mem.toFixed(1) : '—', unit: 'GB', series: recent.map((s) => s.mem), max: live.host.memTotalGb || 1, color: 'rgb(var(--nx-ac))' },
    ...(last?.temp != null ? [{ label: 'TEMP', value: String(Math.round(last.temp)), unit: '°C', series: recent.map((s) => s.temp ?? 0), max: 100, color: last.temp > 70 ? '#ff6b8a' : '#ffd34d' }] : []),
  ]}
  <div class="tele">
    {#each rows as r (r.label)}
      <div class="trow">
        <span class="tlabel">{r.label}</span>
        <Sparkline values={r.series} max={r.max} color={r.color} height={24} span={20} stroke={1.2} fill={0.1} />
        <span class="tvalue">{r.value}<span class="tunit">{r.unit}</span></span>
      </div>
    {/each}
  </div>
{:else if contributedWidget(def.type)}
  {@const Body = contributedWidget(def.type)!.component}
  <Body />
{:else}
  <div class="empty">NO DATA SOURCE CONNECTED YET</div>
{/if}

<style>
  .svcs {
    display: flex;
    flex-direction: column;
  }
  .svc {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    gap: 9px;
    align-items: center;
    padding: 5px 0;
    border-bottom: 1px solid rgba(var(--nx-ac), 0.07);
    font: 400 11px/1.2 var(--font-mono);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .name {
    color: rgb(var(--nx-fg));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state {
    font-size: 9px;
    letter-spacing: 0.12em;
  }
  .tele {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .trow {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 66px;
    gap: 10px;
    align-items: center;
  }
  .tlabel {
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: rgba(var(--nx-ac), 0.75);
  }
  .tvalue {
    text-align: right;
    font: 400 12px/1 var(--font-mono);
    color: rgb(var(--nx-fg));
  }
  .tunit {
    font-size: 9px;
    color: rgba(var(--nx-ac), 0.6);
    margin-left: 3px;
  }
  .logs {
    display: flex;
    flex-direction: column;
    font: 400 10.5px/1.3 var(--font-mono);
  }
  .log {
    display: grid;
    grid-template-columns: 54px 32px minmax(0, 1fr);
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid rgba(var(--nx-ac), 0.07);
    animation: nx-sub 0.4s ease both;
  }
  .ts {
    color: rgba(var(--nx-ac), 0.45);
  }
  .lvl {
    font-size: 8.5px;
    letter-spacing: 0.1em;
    padding-top: 1px;
  }
  .msg {
    color: rgb(var(--nx-ac));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    padding: 14px 0;
    text-align: center;
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(var(--nx-ac), 0.5);
  }
</style>
