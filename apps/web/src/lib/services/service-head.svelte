<script lang="ts">
  import type { ServiceState, ServiceSummary } from '@meridian/service-sdk'

  // `compact`: the Services card's head, whose description always takes two lines so every card is alike.
  let { service, compact = false }: { service: ServiceSummary; compact?: boolean } = $props()

  const STATUS: Record<ServiceState, { label: string; color: string }> = {
    online: { label: 'Online', color: '#3fd68b' },
    degraded: { label: 'Degraded', color: '#ffd34d' },
    offline: { label: 'Offline', color: '#ff6b8a' },
  }

  const st = $derived(STATUS[service.status.state])
</script>

<div class="head" class:compact>
  <div class="mono">{service.mono}</div>
  <div class="names">
    <div class="name">{service.name}</div>
    <div class="desc" title={compact ? service.desc : undefined}>{service.desc}</div>
  </div>
  <div class="pill" style:color={st.color} style:border-color={st.color}>
    <span class="dot" style:background={st.color} style:box-shadow="0 0 8px {st.color}"></span>{st.label}
  </div>
</div>

<style>
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
  .compact .desc {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    line-height: 1.35;
    height: 2.7em;
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
</style>
