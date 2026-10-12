<script lang="ts">
  import type { ServiceActionInfo } from '@meridian/service-sdk'
  import { keyOf, results, resultText, runAction } from '../live/actions.svelte'
  import { inputFields } from './action-groups'

  // `detailed`: the service page's row, which shows the title and opens on the description, flags and input.
  let { serviceId, serviceName, action, detailed = false }: { serviceId: string; serviceName: string; action: ServiceActionInfo; detailed?: boolean } = $props()

  let expanded = $state(false)
  const key = $derived(keyOf(serviceId, action))
  const fields = $derived(inputFields(action.input))
</script>

<div class="row" class:detailed class:expanded>
  <div class="action">
    <span class="method" class:post={action.method === 'POST'}>{action.method}</span>
    {#if detailed}
      <button class="what" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
        <span class="path">{action.path}</span>
        <span class="title">{action.title}</span>
      </button>
    {:else}
      <span class="path" title={action.description}>{action.path}</span>
    {/if}
    <span class="result" class:done={results[key] && !results[key].pending}>{resultText(key)}</span>
    <button class="run" disabled={action.input !== undefined} title={action.input ? 'Needs input' : action.description} onclick={() => runAction(serviceId, action, serviceName)}>RUN</button>
  </div>
  {#if detailed && expanded}
    <div class="details">
      {#if action.description}<p>{action.description}</p>{/if}
      <div class="flags">
        {#if action.mutating}<span class="flag mutating">MUTATING</span>{/if}
        {#if action.gated}<span class="flag gated">GATED</span>{/if}
        <span class="flag">ID {action.id}</span>
      </div>
      {#if fields.length}
        <div class="fields">
          {#each fields as f (f.name)}
            <div class="field">
              <span class="fname">{f.name}{f.required ? '' : '?'}</span>
              <span class="ftype">{f.type}</span>
              <span class="fdesc">{f.description ?? ''}</span>
            </div>
          {/each}
        </div>
        <div class="hint">TAKES INPUT · RUN IT THROUGH NOX</div>
      {/if}
    </div>
  {/if}
</div>

<style>
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
  .what {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 0;
    background: none;
    border: none;
    text-align: left;
    font: inherit;
    cursor: pointer;
  }
  .what:hover .path {
    color: rgb(var(--nx-fg));
  }
  .title {
    font: 400 11.5px/1.2 var(--font-ui);
    color: rgba(var(--nx-ac), 0.65);
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
  .run {
    background: rgba(var(--nx-mu), 0.12);
    border: 1px solid rgba(var(--nx-ac), 0.4);
    border-radius: 3px;
    color: rgb(var(--nx-ac));
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.14em;
    padding: 4px 9px;
    cursor: pointer;
  }
  .run:hover:not(:disabled) {
    background: rgba(var(--nx-mu), 0.3);
  }
  .run:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .row.detailed {
    padding: 8px 10px;
    border-radius: 8px;
    transition: background 0.2s;
  }
  .row.detailed:hover,
  .row.expanded {
    background: rgba(var(--nx-mu), 0.08);
  }
  .details {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin: 10px 0 2px 50px;
    animation: nx-sub 0.3s ease both;
  }
  p {
    margin: 0;
    font: 400 12px/1.45 var(--font-ui);
    color: rgba(var(--nx-ac), 0.8);
  }
  .flags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .flag {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: rgba(var(--nx-ac), 0.7);
    border: 1px solid rgba(var(--nx-ac), 0.22);
    border-radius: 3px;
    padding: 4px 7px;
  }
  .flag.mutating {
    color: #ff6b8a;
    border-color: rgba(255, 107, 138, 0.4);
  }
  .flag.gated {
    color: #ffd34d;
    border-color: rgba(255, 211, 77, 0.4);
  }
  .fields {
    display: flex;
    flex-direction: column;
    border-top: 1px solid rgba(var(--nx-ac), 0.1);
  }
  .field {
    display: grid;
    grid-template-columns: minmax(70px, auto) minmax(60px, auto) minmax(0, 1fr);
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(var(--nx-ac), 0.07);
    font: 400 11px/1.3 var(--font-mono);
  }
  .fname {
    color: rgb(var(--nx-fg));
  }
  .ftype {
    color: rgba(var(--nx-ac), 0.6);
  }
  .fdesc {
    font: 400 11.5px/1.35 var(--font-ui);
    color: rgba(var(--nx-ac), 0.7);
  }
  .hint {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgba(var(--nx-ac), 0.45);
  }
</style>
