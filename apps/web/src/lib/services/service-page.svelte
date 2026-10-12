<script lang="ts">
  import { eventsFor, eventsView } from '../live/events-view.svelte'
  import { clockTime, LEVEL_COLOR, uptime } from '../live/format'
  import { live } from '../live/stream.svelte'
  import SettingSection from '../settings/setting-section.svelte'
  import SettingsSearch from '../settings/settings-search.svelte'
  import { openModule } from '../windows/window-manager.svelte'
  import { groupActions, matchesQuery } from './action-groups'
  import ActionRow from './action-row.svelte'
  import ServiceHead from './service-head.svelte'
  import ServiceLinks from './service-links.svelte'
  import { pageSections, servicePageId } from './service-ui'

  let { serviceId }: { serviceId: string } = $props()

  // Above this many endpoints the groups start closed, so the page opens on their headings.
  const OPEN_UP_TO = 10
  const RECENT_EVENTS = 8

  const service = $derived(live.services.find((s) => s.id === serviceId))
  const container = $derived(service?.container ? live.containers.find((c) => c.name === service.container) : undefined)
  const sections = $derived(pageSections(serviceId))
  const groups = $derived(groupActions(service?.actions ?? []))
  const events = $derived(eventsFor(serviceId).slice(0, RECENT_EVENTS))

  let query = $state('')
  // Only what the owner toggled; the rest follows OPEN_UP_TO.
  let toggled = $state<Record<string, boolean>>({})

  const startsOpen = $derived((service?.actions.length ?? 0) <= OPEN_UP_TO)
  const isGroupOpen = (id: string): boolean => query.trim() !== '' || (toggled[id] ?? startsOpen)
  const allOpen = $derived(groups.every((g) => isGroupOpen(g.id)))
  const shown = $derived(groups.map((g) => ({ ...g, actions: g.actions.filter((a) => matchesQuery(a, query)) })).filter((g) => g.actions.length))

  const setAll = (open: boolean): void => {
    toggled = Object.fromEntries(groups.map((g) => [g.id, open]))
  }

  const facts = $derived(
    service
      ? [
          { k: 'KIND', v: service.managed ? 'managed' : 'code' },
          { k: 'RUNTIME', v: service.runtime },
          { k: 'ADDRESS', v: service.address },
          { k: 'CONTAINER', v: service.container },
          { k: 'UPTIME', v: container ? uptime(container.uptimeSec) : undefined },
          { k: 'CPU', v: container ? `${container.cpu.toFixed(1)}%` : undefined },
          { k: 'MEMORY', v: container ? `${Math.round(container.mem)}M` : undefined },
        ].filter((f): f is { k: string; v: string } => !!f.v)
      : [],
  )

  function openLogs(): void {
    eventsView.filter = serviceId
    openModule('logs')
  }
</script>

{#if service}
  <div class="page">
    <div class="overview glass-card" class:offline={service.status.state === 'offline'}>
      <ServiceHead {service} />
      {#if service.status.message}<div class="message">{service.status.message}</div>{/if}
      <div class="facts">
        {#each facts as f (f.k)}
          <div class="fact"><span class="k">{f.k}</span><span class="v">{f.v}</span></div>
        {/each}
      </div>
      <ServiceLinks {service} />
    </div>

    {#each sections as section, i (section.id)}
      {@const Body = section.component}
      <SettingSection title={section.title.toUpperCase()} delay={0.12 + i * 0.06}>
        <Body />
      </SettingSection>
    {/each}

    {#if service.actions.length}
      <SettingSection title="ENDPOINTS · {service.actions.length}" delay={0.18}>
        <div class="tools">
          <div class="search"><SettingsSearch bind:value={query} scope={servicePageId(serviceId)} placeholder="Search endpoints" /></div>
          {#if groups.length > 1 && !query.trim()}
            <button class="toggle" onclick={() => setAll(!allOpen)}>{allOpen ? 'COLLAPSE ALL' : 'EXPAND ALL'}</button>
          {/if}
        </div>
        <div class="groups">
          {#each shown as g (g.id)}
            {@const opened = isGroupOpen(g.id)}
            <div class="group">
              {#if groups.length > 1}
                <button class="group-head" aria-expanded={opened} onclick={() => (toggled[g.id] = !opened)}>
                  <i class:opened></i>
                  <span class="label">{g.label.toUpperCase()}</span>
                  <span class="count">{g.actions.length}</span>
                  <span class="methods">{g.actions.map((a) => a.method).filter((m, at, all) => all.indexOf(m) === at).join(' · ')}</span>
                </button>
              {/if}
              {#if opened}
                <div class="rows">
                  {#each g.actions as a (a.id)}
                    <ActionRow serviceId={service.id} serviceName={service.name} action={a} detailed />
                  {/each}
                </div>
              {/if}
            </div>
          {:else}
            <div class="empty">NO ENDPOINT MATCHES “{query.trim().toUpperCase()}”</div>
          {/each}
        </div>
      </SettingSection>
    {/if}

    <SettingSection title="RECENT EVENTS" delay={0.24}>
      <div class="events">
        {#each events as e (e.id)}
          <div class="event">
            <span class="ts">{clockTime(e.ts)}</span>
            <span class="lvl" style:color={LEVEL_COLOR[e.level]}>{e.level.toUpperCase()}</span>
            <span class="msg">{e.message}</span>
          </div>
        {:else}
          <div class="empty">NO EVENTS YET</div>
        {/each}
      </div>
      {#if events.length}<button class="toggle all" onclick={openLogs}>ALL EVENTS →</button>{/if}
    </SettingSection>
  </div>
{:else}
  <div class="empty">{live.link === 'offline' ? 'SERVER UNREACHABLE' : 'SERVICE NOT REGISTERED'}</div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .overview {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: nx-sub 0.55s ease 0.16s both;
  }
  .overview.offline {
    opacity: 0.6;
  }
  .message {
    font: 400 12px/1.4 var(--font-ui);
    color: rgba(var(--nx-ac), 0.8);
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px 14px;
  }
  .fact {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .k {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgba(var(--nx-ac), 0.5);
  }
  .v {
    font: 400 12px/1.2 var(--font-mono);
    color: rgb(var(--nx-fg));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tools {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .search {
    flex: 1;
    min-width: 0;
  }
  .toggle {
    flex: none;
    background: none;
    border: 1px solid rgba(var(--nx-ac), 0.28);
    border-radius: 3px;
    color: rgb(var(--nx-ac));
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.16em;
    padding: 6px 10px;
    cursor: pointer;
  }
  .toggle:hover {
    border-color: rgba(var(--nx-ac), 0.8);
    color: rgb(var(--nx-fg));
  }
  .toggle.all {
    align-self: flex-start;
  }
  .groups {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .group-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: rgba(var(--nx-mu), 0.06);
    border: 1px solid rgba(var(--nx-ac), 0.12);
    border-radius: 8px;
    color: rgb(var(--nx-ac));
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.16em;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.2s;
  }
  .group-head:hover {
    border-color: rgba(var(--nx-ac), 0.4);
  }
  .group-head i {
    width: 5px;
    height: 5px;
    flex: none;
    border-right: 1px solid rgba(var(--nx-ac), 0.8);
    border-bottom: 1px solid rgba(var(--nx-ac), 0.8);
    transform: rotate(-45deg);
    transition: transform 0.2s;
  }
  .group-head i.opened {
    transform: rotate(45deg);
  }
  .label {
    color: rgb(var(--nx-fg));
  }
  .count {
    color: rgba(var(--nx-ac), 0.6);
  }
  .methods {
    margin-left: auto;
    font-size: 9px;
    color: rgba(var(--nx-ac), 0.45);
  }
  .rows {
    display: flex;
    flex-direction: column;
    padding: 2px 0 4px;
    animation: nx-sub 0.3s ease both;
  }
  .events {
    display: flex;
    flex-direction: column;
    font: 400 11.5px/1.3 var(--font-mono);
  }
  .event {
    display: grid;
    grid-template-columns: 64px 44px minmax(0, 1fr);
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(var(--nx-ac), 0.07);
  }
  .ts {
    color: rgba(var(--nx-ac), 0.55);
  }
  .lvl {
    font-size: 10px;
    letter-spacing: 0.08em;
  }
  .msg {
    color: rgb(var(--nx-fg));
    overflow-wrap: anywhere;
  }
  .empty {
    padding: 18px 0;
    text-align: center;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.22em;
    color: rgba(var(--nx-ac), 0.5);
  }
</style>
