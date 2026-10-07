<script lang="ts">
  import { eventsFor, eventsView } from '../live/events-view.svelte'
  import SettingsWindow from '../settings/settings-window.svelte'
  import CalendarModuleWindow from '../module-windows/calendar-module-window.svelte'
  import CamerasWindow from '../module-windows/cameras-window.svelte'
  import { contributedWindow, moduleContributions } from '../services/service-ui'
  import TelemetryWindow from '../module-windows/telemetry-window.svelte'
  import ServicesWindow from '../module-windows/services-window.svelte'
  import EventsWindow from '../module-windows/events-window.svelte'
  import DocWindowBody from '../docs/doc-window-body.svelte'
  import { docs } from '../docs/docs.svelte'
  import { stageSides } from '../dock/dock.svelte'
  import { stageInsets } from '../dock/stage-insets'
  import { isStacked } from '../workspace/layout.svelte'
  import { live } from '../live/stream.svelte'
  import { visibleServices } from '../workspace/prefs.svelte'
  import WindowFrame from './window-frame.svelte'
  import WindowPlaceholder from './window-placeholder.svelte'
  import { arrange, isOpen, setStage, wm, type WindowId } from './window-manager.svelte'

  let el: HTMLDivElement

  const insets = $derived(stageInsets(stageSides(), isStacked()))

  $effect(() => {
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setStage({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  })

  const liveCount = $derived(wm.wins.filter((w) => !w.closing).length)

  function footLeft(id: WindowId): string {
    if (id === 'services') return `${visibleServices().filter((s) => s.status.state === 'online').length}/${visibleServices().length} SERVICES ONLINE`
    if (id === 'doc') return `COMPOSED BY NOX · ${docs.current?.blocks.length ?? 0} BLOCKS`
    if (id === 'cameras' || id === 'calendar') return moduleContributions(id).map((c) => (typeof c.footer === 'function' ? c.footer() : c.footer)).filter(Boolean).join(' · ')
    if (id === 'logs') return `${eventsFor(eventsView.filter).length} EVENTS BUFFERED`
    if (id === 'telemetry') return `${live.host.name.toUpperCase()} · LIVE`
    return ''
  }

  // A guide on the stage's far edge is drawn one pixel inward so it stays visible.
  const guideStyle = (g: (typeof wm.guides)[number]): string => {
    const far = g.pos >= (g.axis === 'x' ? wm.stage.w : wm.stage.h)
    const at = `${Math.round(g.pos) - (far ? 1 : 0)}px`
    const op = g.kind === 'centre' ? 0.75 : g.kind === 'gap' ? 0.4 : 0.55
    return g.axis === 'x' ? `left:${at};top:0;width:1px;height:100%;opacity:${op}` : `top:${at};left:0;height:1px;width:100%;opacity:${op}`
  }
</script>

<div class="stage" bind:this={el} style:--inset-l={insets.left} style:--inset-r={insets.right} style:--inset-t={insets.top} style:--inset-b={insets.bottom}>
  {#if wm.gesture}<div class="outline"></div>{/if}
  {#if liveCount > 1}
    <div class="count">
      <span class="label"><i></i>{liveCount}/4 WINDOWS</span>
      <button class:custom={wm.custom} onclick={arrange}>ARRANGE</button>
    </div>
  {/if}
  {#if wm.stage.w}
    <!-- A new document replaces the old one with a fresh open animation, hence the title in the key. -->
    {#each wm.wins as win (win.id === 'doc' ? `doc:${docs.current?.title}` : win.id)}
      <WindowFrame {win} footLeft={footLeft(win.id)}>
        {#if win.id === 'doc'}<DocWindowBody />{:else if win.id === 'settings'}<SettingsWindow />{:else if win.id === 'logs'}<EventsWindow />{:else if win.id === 'services'}<ServicesWindow />{:else if win.id === 'telemetry'}<TelemetryWindow />{:else if win.id === 'cameras'}<CamerasWindow />{:else if win.id === 'calendar'}<CalendarModuleWindow />{:else}{@const own = contributedWindow(win.id)}{#if own}{@const Body = own.component}<Body />{:else}<WindowPlaceholder />{/if}{/if}
      </WindowFrame>
    {/each}
  {/if}
  {#each wm.guides as g (g.axis + g.pos + g.kind)}<div class="guide" style={guideStyle(g)}></div>{/each}
</div>

<style>
  .stage {
    position: absolute;
    top: calc(108px + var(--inset-t, 0px));
    bottom: calc(178px + var(--inset-b, 0px));
    left: var(--inset-l, 20px);
    right: var(--inset-r, 20px);
    z-index: 4;
    pointer-events: none;
    transition:
      left 0.4s var(--ease-out),
      right 0.4s var(--ease-out),
      top 0.4s var(--ease-out),
      bottom 0.4s var(--ease-out);
  }
  .stage :global(.win) {
    pointer-events: auto;
  }
  .outline {
    position: absolute;
    inset: -6px;
    border: 1px dashed rgba(var(--nx-ac), 0.18);
    border-radius: 20px;
    pointer-events: none;
    animation: nx-sub 0.2s ease both;
  }
  .count {
    position: absolute;
    top: -36px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
    pointer-events: auto;
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.18em;
    color: rgba(var(--nx-ac), 0.65);
    animation: nx-sub 0.35s ease both;
  }
  .label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .label i {
    width: 4px;
    height: 4px;
    border: 1px solid rgba(var(--nx-ac), 0.7);
    transform: rotate(45deg);
  }
  .count button {
    height: 22px;
    padding: 0 10px;
    background: rgba(var(--nx-pn), 0.6);
    border: 1px solid rgba(var(--nx-ac), 0.3);
    border-radius: 6px;
    color: rgb(var(--nx-ac));
    font: inherit;
    letter-spacing: inherit;
    cursor: pointer;
    opacity: 0.45;
    transition: opacity 0.25s;
  }
  .count button.custom {
    opacity: 1;
  }
  .count button:hover {
    border-color: rgba(var(--nx-ac), 0.7);
    color: rgb(var(--nx-fg));
  }
  .guide {
    position: absolute;
    background: rgb(var(--nx-ac));
    box-shadow: 0 0 6px rgba(var(--nx-ac), 0.6);
    z-index: 60;
    pointer-events: none;
  }
</style>
