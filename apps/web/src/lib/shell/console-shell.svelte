<script lang="ts">
  import type { Snippet } from 'svelte'
  import ConsoleHeader from './console-header.svelte'
  import LeftRail from './left-rail.svelte'
  import RightRail from './right-rail.svelte'

  let { children }: { children: Snippet } = $props()
</script>

<div class="page">
  <div class="shell">
    <div class="scanlines"></div>
    <div class="scan-sweep"></div>
    <div class="corner corner-tl"></div>
    <div class="corner corner-br"></div>

    <ConsoleHeader />
    <div class="divider"></div>

    <div class="body">
      <LeftRail />
      <section class="content">
        {@render children()}
      </section>
      <RightRail />
    </div>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    padding: 26px;
    background: var(--bg-page-glow);
    overflow-x: auto;
  }

  .shell {
    position: relative;
    min-width: 1420px;
    border: 1px solid rgba(79, 214, 184, 0.16);
    background: var(--bg-console);
    box-shadow: 0 40px 120px -50px rgba(0, 0, 0, 1), inset 0 0 120px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }

  .scanlines {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 5;
    background: repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0 1px, transparent 1px 3px);
  }

  .scan-sweep {
    position: absolute;
    left: 0;
    right: 0;
    height: 140px;
    pointer-events: none;
    z-index: 5;
    background: linear-gradient(180deg, transparent, rgba(79, 214, 184, 0.05), transparent);
    animation: scan-sweep 11s linear infinite;
  }

  .corner {
    position: absolute;
    width: 16px;
    height: 16px;
    z-index: 6;
    border-color: rgba(79, 214, 184, 0.5);
  }

  .corner-tl {
    top: 8px;
    left: 8px;
    border-top: 1px solid;
    border-left: 1px solid;
  }

  .corner-br {
    bottom: 8px;
    right: 8px;
    border-bottom: 1px solid;
    border-right: 1px solid;
  }

  .divider {
    height: 1px;
    margin: 0 22px;
    background: linear-gradient(90deg, rgba(79, 214, 184, 0.32), rgba(79, 214, 184, 0.06) 60%, transparent);
  }

  .body {
    position: relative;
    z-index: 6;
    display: grid;
    grid-template-columns: 212px 1fr 236px;
    min-height: 660px;
  }

  .content {
    position: relative;
    min-width: 0;
    border-left: 1px solid rgba(79, 214, 184, 0.1);
    border-right: 1px solid rgba(79, 214, 184, 0.1);
    padding-top: 14px;
  }
</style>
