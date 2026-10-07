<script lang="ts">
  import { eventsFor, eventsView } from '../live/events-view.svelte'
  import { clockTime, LEVEL_COLOR } from '../live/format'
  import { live } from '../live/stream.svelte'

  const VISIBLE = 60

  // Services first (those that can emit or already have), then NOX, whose actions are logged here,
  // then any other source such as the core.
  const chips = $derived.by(() => {
    const seen = new Set(live.events.map((e) => e.source))
    const services = live.services.filter((s) => s.emitsEvents || s.actions.length || seen.has(s.id)).map((s) => s.id)
    const rest = [...seen].filter((id) => id !== 'nox' && !services.includes(id))
    return ['all', ...services, 'nox', ...rest]
  })
  const rows = $derived(eventsFor(eventsView.filter).slice(0, VISIBLE))
</script>

<div class="chips">
  {#each chips as id (id)}
    <button class:active={eventsView.filter === id} onclick={() => (eventsView.filter = id)}>{id === 'all' ? 'ALL' : id}</button>
  {/each}
  <span class="live">● LIVE</span>
</div>

<div class="rows">
  {#each rows as e (e.id)}
    <div class="row">
      <span class="ts">{clockTime(e.ts, true)}</span>
      <span class="src">{e.source}</span>
      <span class="lvl" style:color={LEVEL_COLOR[e.level]}>{e.level.toUpperCase()}</span>
      <span class="msg">{e.message}</span>
    </div>
  {:else}
    <div class="empty">NO EVENTS YET</div>
  {/each}
</div>

<style>
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 12px;
  }
  .chips button {
    background: transparent;
    border: 1px solid rgba(var(--nx-ac), 0.22);
    border-radius: 3px;
    color: rgba(var(--nx-ac), 0.7);
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.1em;
    padding: 5px 10px;
    cursor: pointer;
  }
  .chips button.active {
    background: rgba(var(--nx-mu), 0.22);
    border-color: rgba(var(--nx-ac), 0.7);
    color: rgb(var(--nx-fg));
  }
  .live {
    margin-left: auto;
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.22em;
    color: rgb(var(--nx-ac));
    animation: nx-blink 1.4s ease-in-out infinite;
  }
  .rows {
    display: flex;
    flex-direction: column;
    font: 400 12px/1.3 var(--font-mono);
  }
  .row {
    display: grid;
    grid-template-columns: 92px 80px 44px minmax(0, 1fr);
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(var(--nx-ac), 0.07);
    animation: nx-sub 0.4s ease both;
  }
  .ts {
    color: rgba(var(--nx-ac), 0.5);
  }
  .src {
    color: rgb(var(--nx-ac));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lvl {
    font-size: 9px;
    letter-spacing: 0.1em;
    padding-top: 2px;
  }
  .msg {
    color: rgb(var(--nx-ac));
  }
  .empty {
    padding: 24px 0;
    text-align: center;
    font-size: 10px;
    letter-spacing: 0.22em;
    color: rgba(var(--nx-ac), 0.5);
  }
</style>
