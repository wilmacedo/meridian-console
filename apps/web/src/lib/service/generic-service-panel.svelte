<script lang="ts">
  import type { ServiceViewProps } from '@meridian/service-sdk/web'

  const { service }: ServiceViewProps = $props()

  const stateLabel = { ok: 'HEALTHY', warn: 'ATTENTION', err: 'DOWN' } as const
</script>

<div class="panel">
  <div class="head">
    <div class="title-row">
      <div class="title">{service.name}</div>
      <div class="chip {service.status.state}">{stateLabel[service.status.state]}</div>
    </div>
    <div class="subtitle">{service.kind} · {service.host}{service.description ? ` · ${service.description}` : ''}</div>
  </div>

  {#if service.status.message}
    <div class="message {service.status.state}">{service.status.message}</div>
  {/if}

  {#if service.status.facts?.length}
    <div class="facts">
      {#each service.status.facts as fact (fact.label)}
        <div class="fact">
          <span class="key">{fact.label}</span>
          <span class="value">{fact.value}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .panel {
    height: 100%;
    padding: 6px 22px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    animation: rise 0.4s ease both;
  }

  .head {
    flex: none;
    border-bottom: 1px solid var(--line-hairline);
    padding-bottom: 12px;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .title {
    font: 600 17px/1.2 var(--font-mono);
    letter-spacing: 0.1em;
    color: var(--text-primary);
  }

  .chip {
    padding: 3px 7px;
    border: 1px solid var(--line-strong);
    font: 500 8.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--accent-teal);
  }

  .chip.warn {
    border-color: var(--accent-amber);
    color: var(--accent-amber);
  }

  .chip.err {
    border-color: var(--state-err);
    color: var(--state-err);
  }

  .subtitle {
    margin-top: 6px;
    font: 500 9px/1.4 var(--font-mono);
    letter-spacing: 0.1em;
    color: var(--text-muted);
  }

  .message {
    font: 500 10px/1.4 var(--font-mono);
    letter-spacing: 0.08em;
    color: var(--text-body);
  }

  .message.warn {
    color: var(--accent-amber);
  }

  .message.err {
    color: var(--state-err);
  }

  .facts {
    max-width: 520px;
    border: 1px solid var(--line-hairline);
    background: var(--bg-inset);
    padding: 4px 14px;
  }

  .fact {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 9px 0;
    border-bottom: 1px solid var(--line-row);
    font: 500 9px/1.3 var(--font-mono);
    letter-spacing: 0.08em;
  }

  .fact:last-child {
    border-bottom: none;
  }

  .key {
    color: var(--text-muted);
  }

  .value {
    text-align: right;
    color: var(--text-primary);
  }
</style>
