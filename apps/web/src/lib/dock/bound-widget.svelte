<script lang="ts">
  import { renderTemplate, type LiveWidgetSpec } from '@meridian/service-sdk'
  import DocBlocks from '../docs/doc-blocks.svelte'
  import type { DocBlock } from '../docs/doc-blocks'

  let { bind }: { bind: LiveWidgetSpec } = $props()

  let blocks = $state<DocBlock[] | null>(null)
  let stale = $state(false)

  // Runs the bound action now and every few seconds, for as long as the widget is on screen. A hidden tab
  // doesn't poll; it catches up when it is shown again.
  $effect(() => {
    const { service, action, params, everySec, template } = $state.snapshot(bind) as LiveWidgetSpec
    let stopped = false

    async function refresh(): Promise<void> {
      if (document.hidden) return
      try {
        const res = await fetch(`/api/services/${encodeURIComponent(service)}/actions/${encodeURIComponent(action)}`, {
          method: 'POST',
          headers: params ? { 'Content-Type': 'application/json' } : {},
          body: params ? JSON.stringify(params) : undefined,
        })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const body = (await res.json()) as { result: unknown }
        if (stopped) return
        blocks = renderTemplate(template, body.result)
        stale = false
      } catch {
        if (!stopped) stale = true
      }
    }

    void refresh()
    const timer = setInterval(() => void refresh(), everySec * 1000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  })
</script>

{#if blocks}
  <div class:stale>
    <DocBlocks {blocks} compact />
  </div>
  {#if stale}<div class="note">SOURCE NOT ANSWERING · SHOWING THE LAST READING</div>{/if}
{:else}
  <div class="note">{stale ? 'SOURCE NOT ANSWERING' : 'READING…'}</div>
{/if}

<style>
  .stale {
    opacity: 0.55;
    transition: opacity 0.3s ease;
  }
  .note {
    margin-top: 6px;
    font: 400 9px/1.2 var(--font-mono);
    letter-spacing: 0.14em;
    color: rgba(var(--nx-ac), 0.55);
  }
</style>
