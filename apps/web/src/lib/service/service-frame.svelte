<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { ServiceSummary } from '@meridian/service-sdk'
  import { appState } from '../state/app-state.svelte'

  interface Props {
    service: ServiceSummary
    children: Snippet
  }

  const { service, children }: Props = $props()

  function backToOverview() {
    appState.screen = 'overview'
    appState.navOpen = false
  }

  function switchService() {
    appState.navOpen = !appState.navOpen
  }
</script>

<div class="frame">
  <div class="breadcrumb">
    <button type="button" class="link" onclick={backToOverview}>◄ OVERVIEW</button>
    <button type="button" class="switch" onclick={switchService}>SWITCH SERVICE ▾</button>
    <span class="kind-chip">{service.kind.toUpperCase()}</span>
  </div>
  <div class="content">
    {@render children()}
  </div>
</div>

<style>
  .frame {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .breadcrumb {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 22px 0;
  }

  .content {
    flex: 1;
    min-height: 0;
  }

  .link {
    all: unset;
    font: 500 8.5px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgba(160, 196, 187, 0.5);
    cursor: pointer;
    transition: color 0.15s;
  }

  .link:hover {
    color: #8fe8d4;
  }

  .switch {
    all: unset;
    padding: 4px 8px;
    border: 1px solid rgba(79, 214, 184, 0.3);
    font: 600 8px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: #bfe8dc;
    cursor: pointer;
    transition: background 0.15s;
  }

  .switch:hover {
    background: rgba(79, 214, 184, 0.14);
  }

  .kind-chip {
    padding: 4px 8px;
    border: 1px solid rgba(224, 123, 40, 0.35);
    font: 600 8px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: #f0b980;
  }
</style>
