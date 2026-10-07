<script lang="ts">
  import type { ServiceState } from '@meridian/service-sdk'
  import { results, keyOf, runAction } from '../live/actions.svelte'
  import { eventsView } from '../live/events-view.svelte'
  import { uptime } from '../live/format'
  import { windowsOf } from '../services/service-ui'
  import { live } from '../live/stream.svelte'
  import { visibleServices } from '../workspace/prefs.svelte'
  import { open, openModule } from '../windows/window-manager.svelte'

  const STATUS: Record<ServiceState, { label: string; color: string }> = {
    online: { label: 'Online', color: '#3fd68b' },
    degraded: { label: 'Degraded', color: '#ffd34d' },
    offline: { label: 'Offline', color: '#ff6b8a' },
  }

  const uptimeOf = (container: string | undefined): string => {
    const c = container ? live.containers.find((x) => x.name === container) : undefined
    return c ? uptime(c.uptimeSec) : '—'
  }

  function openLogs(id: string): void {
    eventsView.filter = id
    openModule('logs')
  }

  const hasLog = (id: string, emits: boolean, actions: number): boolean => emits || actions > 0 || live.events.some((e) => e.source === id)

  const resultText = (key: string): string => {
    const r = results[key]
    if (!r) return '—'
    if (r.pending) return '· · ·'
    return r.status ? `${r.status} · ${r.ms ?? 0}ms` : 'FAILED'
  }
</script>

<div class="grid">
  {#each visibleServices() as s, i (s.id)}
    {@const st = STATUS[s.status.state]}
    <div class="card glass-card" class:offline={s.status.state === 'offline'} style:animation-delay="{0.16 + i * 0.06}s">
      <div class="head">
        <div class="mono">{s.mono}</div>
        <div class="names">
          <div class="name">{s.name}</div>
          <div class="desc">{s.desc}</div>
        </div>
        <div class="pill" style:color={st.color} style:border-color={st.color}>
          <span class="dot" style:background={st.color} style:box-shadow="0 0 8px {st.color}"></span>{st.label}
        </div>
      </div>
      <div class="meta">
        {#if s.runtime}<span>{s.runtime}</span>{/if}
        {#if s.address}<span>{s.address}</span>{/if}
        <span>UP {uptimeOf(s.container)}</span>
      </div>
      {#if s.actions.length}
        <div class="actions">
          {#each s.actions as a (a.id)}
            {@const key = keyOf(s.id, a)}
            <div class="action">
              <span class="method" class:post={a.method === 'POST'}>{a.method}</span>
              <span class="path" title={a.description}>{a.path}</span>
              <span class="result" class:done={results[key] && !results[key].pending}>{resultText(key)}</span>
              <button disabled={a.input !== undefined} title={a.input ? 'Needs input' : a.description} onclick={() => runAction(s.id, a)}>RUN</button>
            </div>
          {/each}
        </div>
      {/if}
      <div class="links">
        {#if hasLog(s.id, s.emitsEvents, s.actions.length)}<button class="link" onclick={() => openLogs(s.id)}>LOGS →</button>{/if}
        {#each windowsOf(s.id) as w (w.windowId)}
          <button class="link" onclick={() => open(w.windowId)}>{w.title.toUpperCase()} →</button>
        {/each}
        {#if s.url}<a class="link" href={s.url} target="_blank" rel="noreferrer">OPEN ↗</a>{/if}
      </div>
    </div>
  {:else}
    <div class="empty">{live.link !== 'offline' ? 'NO SERVICES REGISTERED' : 'SERVER UNREACHABLE'}</div>
  {/each}
</div>
<div class="note">Services come from the services folder, or are added by NOX</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 10px;
  }
  .card {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 11px;
    animation: nx-sub 0.55s ease both;
  }
  .card.offline {
    opacity: 0.5;
  }
  .head {
    display: flex;
    gap: 11px;
    align-items: center;
  }
  .mono {
    width: 36px;
    height: 36px;
    flex: none;
    display: grid;
    place-items: center;
    border: 1px solid rgba(var(--nx-ac), 0.7);
    border-radius: 8px;
    background: rgba(var(--nx-mu), 0.14);
    font: 600 13px/1 var(--font-mono);
    color: rgb(var(--nx-ac));
  }
  .names {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-size: 15px;
    font-weight: 600;
    color: rgb(var(--nx-fg));
  }
  .desc {
    font-size: 12px;
    color: rgba(var(--nx-ac), 0.75);
  }
  .pill {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 500 10px/1 var(--font-ui);
    border: 1px solid;
    border-radius: 20px;
    padding: 3px 9px 3px 7px;
    background: rgba(var(--nx-pn), 0.6);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .meta {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font: 400 10px/1.2 var(--font-mono);
    letter-spacing: 0.06em;
    color: rgba(var(--nx-ac), 0.65);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid rgba(var(--nx-ac), 0.14);
    padding-top: 10px;
  }
  .action {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto auto;
    gap: 10px;
    align-items: center;
    font: 400 11px/1.2 var(--font-mono);
  }
  .method {
    font-size: 9px;
    letter-spacing: 0.1em;
    color: rgb(var(--nx-ac));
  }
  .method.post {
    color: #ffd34d;
  }
  .path {
    color: rgb(var(--nx-ac));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .result {
    font-size: 10px;
    color: rgba(var(--nx-ac), 0.45);
  }
  .result.done {
    color: rgb(var(--nx-ac));
  }
  .action button {
    background: rgba(var(--nx-mu), 0.12);
    border: 1px solid rgba(var(--nx-ac), 0.4);
    border-radius: 3px;
    color: rgb(var(--nx-ac));
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.14em;
    padding: 4px 9px;
    cursor: pointer;
  }
  .action button:hover:not(:disabled) {
    background: rgba(var(--nx-mu), 0.3);
  }
  .action button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .links {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: auto;
  }
  .link {
    background: none;
    border: 1px solid rgba(var(--nx-ac), 0.28);
    border-radius: 3px;
    color: rgb(var(--nx-ac));
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.16em;
    padding: 6px 10px;
    cursor: pointer;
    text-decoration: none;
  }
  .link:hover {
    border-color: rgba(var(--nx-ac), 0.8);
    color: rgb(var(--nx-fg));
  }
  .note {
    margin-top: 14px;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.08em;
    color: rgba(var(--nx-ac), 0.5);
  }
  .empty {
    grid-column: 1 / -1;
    padding: 24px 0;
    text-align: center;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.22em;
    color: rgba(var(--nx-ac), 0.5);
  }
</style>
