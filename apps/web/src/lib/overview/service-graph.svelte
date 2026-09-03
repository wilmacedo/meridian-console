<script lang="ts">
  import { onMount } from 'svelte'
  import { appState } from '../state/app-state.svelte'
  import { buildGraphNodes, buildLinks, buildTravellingPackets } from './graph'

  const teal = '#4fd6b8'
  const amber = '#e07b28'

  const nodes = $derived(buildGraphNodes(appState.svcId, teal, amber))
  const links = $derived(buildLinks(teal, amber))
  const packets = $derived(buildTravellingPackets(links))

  const lastLoad = $derived(Math.round(appState.series.a[appState.series.a.length - 1]))
  const donutLoadDasharray = $derived(`${Math.round(lastLoad * 2.6)} 440`)

  // Pan/zoom viewport over the fixed 820x420 graph space, Figma/Excalidraw-style: drag (mouse or
  // single touch) to pan, wheel or pinch to zoom, clamped to a generous but bounded margin so the
  // graph can never be dragged out of reach.
  const CANVAS_WIDTH = 820
  const CANVAS_HEIGHT = 420
  const MIN_ZOOM = 0.6
  const MAX_ZOOM = 2.5
  const PAN_MARGIN = 160
  const DRAG_THRESHOLD = 5

  let viewportEl: HTMLDivElement
  let zoom = $state(1)
  let panX = $state(0)
  let panY = $state(0)
  let dragging = $state(false)

  let lastX = 0
  let lastY = 0
  let startX = 0
  let startY = 0
  let suppressClick = false
  let captured = false
  const pointers = new Map<number, { x: number; y: number }>()
  let pinchStartDist = 0
  let pinchStartZoom = 1

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max)
  }

  function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function clampPan() {
    if (!viewportEl) return
    const rect = viewportEl.getBoundingClientRect()
    const contentW = CANVAS_WIDTH * zoom
    const contentH = CANVAS_HEIGHT * zoom

    const minX = rect.width - contentW - PAN_MARGIN
    const maxX = PAN_MARGIN
    panX = minX > maxX ? (rect.width - contentW) / 2 : clamp(panX, minX, maxX)

    const minY = rect.height - contentH - PAN_MARGIN
    const maxY = PAN_MARGIN
    panY = minY > maxY ? (rect.height - contentH) / 2 : clamp(panY, minY, maxY)
  }

  function applyZoom(factor: number, originX: number, originY: number) {
    const newZoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM)
    const actualFactor = newZoom / zoom
    panX = originX - (originX - panX) * actualFactor
    panY = originY - (originY - panY) * actualFactor
    zoom = newZoom
    clampPan()
  }

  function zoomBy(factor: number) {
    const rect = viewportEl.getBoundingClientRect()
    applyZoom(factor, rect.width / 2, rect.height / 2)
  }

  function resetView() {
    zoom = 1
    panX = 0
    panY = 0
    clampPan()
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const rect = viewportEl.getBoundingClientRect()
    const factor = Math.exp(-e.deltaY * 0.001)
    applyZoom(factor, e.clientX - rect.left, e.clientY - rect.top)
  }

  // Pointer capture is deferred until a gesture is confirmed as a drag/pinch (past
  // DRAG_THRESHOLD, or a second finger joins). Capturing eagerly on every pointerdown would
  // retarget the browser's synthesized click to the viewport, so a plain tap on a node or a
  // zoom button would never reach its own click handler.
  function onPointerDown(e: PointerEvent) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    suppressClick = false

    if (pointers.size === 1) {
      dragging = false
      lastX = e.clientX
      lastY = e.clientY
      startX = e.clientX
      startY = e.clientY
    } else if (pointers.size === 2) {
      viewportEl.setPointerCapture(e.pointerId)
      captured = true
      dragging = false
      suppressClick = true
      const pts = [...pointers.values()]
      pinchStartDist = distance(pts[0], pts[1])
      pinchStartZoom = zoom
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.size === 2) {
      const pts = [...pointers.values()]
      const dist = distance(pts[0], pts[1])
      const rect = viewportEl.getBoundingClientRect()
      const midX = (pts[0].x + pts[1].x) / 2 - rect.left
      const midY = (pts[0].y + pts[1].y) / 2 - rect.top
      if (pinchStartDist > 0) {
        applyZoom((dist / pinchStartDist) * (pinchStartZoom / zoom), midX, midY)
      }
      pinchStartDist = dist
      pinchStartZoom = zoom
      return
    }

    if (pointers.size !== 1) return

    if (!dragging) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) <= DRAG_THRESHOLD) return
      dragging = true
      suppressClick = true
      viewportEl.setPointerCapture(e.pointerId)
      captured = true
      lastX = e.clientX
      lastY = e.clientY
    }

    panX += e.clientX - lastX
    panY += e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    clampPan()
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) pinchStartDist = 0
    if (pointers.size === 0) {
      dragging = false
      captured = false
    }
  }

  function onPointerLeave(e: PointerEvent) {
    if (!captured) pointers.delete(e.pointerId)
  }

  onMount(() => {
    clampPan()
    const onResize = () => clampPan()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  })

  function selectService(id: string) {
    if (suppressClick) return
    appState.screen = 'service'
    appState.svcId = id
    appState.navOpen = false
  }

  function selectHost(hostName: string) {
    if (suppressClick) return
    appState.screen = 'service'
    appState.navOpen = true
    appState.svcQ = hostName
  }
</script>

<div
  class="viewport"
  class:dragging
  role="application"
  aria-label="Service topology graph — drag to pan, scroll or pinch to zoom"
  bind:this={viewportEl}
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onpointerleave={onPointerLeave}
>
  <div class="canvas" style:transform={`translate(${panX}px, ${panY}px) scale(${zoom})`}>
    <svg width="820" height="420" viewBox="0 0 820 420">
      <g fill="none" stroke="rgba(79,214,184,.13)">
        <circle cx="500" cy="210" r="196" stroke-dasharray="1 9" />
        <circle cx="500" cy="210" r="150" />
      </g>
      <g class="orbit-ring" fill="none" stroke="rgba(79,214,184,.18)" stroke-dasharray="18 12">
        <circle cx="500" cy="210" r="118" />
      </g>

      {#each links as link, i (i)}
        <line x1={link.x1} y1={link.y1} x2={link.x2} y2={link.y2} stroke={link.color} stroke-width={link.width} opacity={link.opacity} />
      {/each}

      {#each packets as packet, i (i)}
        <circle r="3" fill={packet.color} style={`offset-path:${packet.path};animation:packet-travel ${packet.duration}s linear infinite ${packet.delay}s`} />
      {/each}

      <circle cx="500" cy="210" r="70" fill="none" stroke="rgba(79,214,184,.1)" stroke-width="26" />
      <circle cx="500" cy="210" r="70" fill="none" stroke={amber} stroke-width="26" stroke-dasharray={donutLoadDasharray} transform="rotate(28 500 210)" />
      <circle cx="500" cy="210" r="70" fill="none" stroke="rgba(79,214,184,.85)" stroke-width="2" stroke-dasharray="96 440" transform="rotate(184 500 210)" />
      <circle cx="500" cy="210" r="44" fill="#0c1512" stroke="rgba(79,214,184,.35)" />
    </svg>

    <!-- Node labels and readouts are HTML overlays, never SVG <text> — see
         docs/design-handoff.md#known-pitfalls-already-hit-in-this-design. -->
    <div class="overlay">
      <div class="hub-label">
        <div class="hub-dot"></div>
        <div class="hub-name">main server</div>
      </div>
      <div class="hub-load">
        <div class="hub-load-arrow"></div>
        <div class="hub-load-value">{lastLoad}%</div>
      </div>

      {#each nodes as node (node.id)}
        {#if node.kind === 'infra'}
          <button
            type="button"
            class="node infra-node"
            style:left={`${node.leftPct}%`}
            style:top={`${node.topPct}%`}
            style:width={`${node.size}px`}
            style:height={`${node.size}px`}
            style:margin={`${-node.size / 2}px 0 0 ${-node.size / 2}px`}
            style:--node-color={node.color}
            title={node.tip}
            disabled={!node.clickable}
            onclick={() => selectHost(node.name)}
          >
            <div class="glyph glyph-{node.glyph}"></div>
            <span class="node-label infra-label" style:top={`${node.size + 5}px`}>{node.name}</span>
          </button>
        {:else}
          <button
            type="button"
            class="node service-node"
            class:selected={node.selected}
            style:left={`${node.leftPct}%`}
            style:top={`${node.topPct}%`}
            style:width={`${node.size}px`}
            style:height={`${node.size}px`}
            style:margin={`${-node.size / 2}px 0 0 ${-node.size / 2}px`}
            style:--node-color={node.color}
            title={node.tip}
            onclick={() => selectService(node.id)}
          >
            <div class="service-glyph" class:round={node.isPacketKind}></div>
            <span class="node-label service-label" class:selected={node.selected} style:top={`${node.size + 2}px`}>{node.name}</span>
          </button>
        {/if}
      {/each}
    </div>
  </div>

  <div class="zoom-controls">
    <button type="button" onclick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
    <span class="zoom-value">{Math.round(zoom * 100)}%</span>
    <button type="button" onclick={() => zoomBy(0.8)} aria-label="Zoom out">−</button>
    <button type="button" onclick={resetView} aria-label="Reset view">⤢</button>
  </div>
</div>

<style>
  .viewport {
    position: relative;
    flex: 1;
    min-height: 0;
    width: 100%;
    overflow: hidden;
    touch-action: none;
    cursor: grab;
  }

  .viewport.dragging {
    cursor: grabbing;
  }

  .canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 820px;
    height: 420px;
    transform-origin: 0 0;
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .orbit-ring {
    transform-origin: 500px 210px;
    animation: orbit 90s linear infinite;
  }

  .overlay {
    position: absolute;
    inset: 0;
  }

  .hub-label {
    position: absolute;
    left: 61%;
    top: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    pointer-events: none;
  }

  .hub-dot {
    width: 8px;
    height: 8px;
    background: rgba(200, 228, 220, 0.9);
    margin: 0 auto 6px;
  }

  .hub-name {
    font: 600 9px/1.4 var(--font-mono);
    letter-spacing: 0.14em;
    color: rgba(200, 228, 220, 0.75);
  }

  .hub-load {
    position: absolute;
    left: 61%;
    top: 58%;
    transform: translate(-50%, 0);
    text-align: center;
  }

  .hub-load-arrow {
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 6px solid rgba(79, 214, 184, 0.6);
    margin: 0 auto 4px;
  }

  .hub-load-value {
    display: inline-block;
    padding: 4px 9px;
    border: 1px solid rgba(79, 214, 184, 0.4);
    background: rgba(7, 12, 11, 0.9);
    font: 600 12px/1 var(--font-mono);
    color: var(--text-primary);
  }

  .node {
    all: unset;
    position: absolute;
    display: grid;
    place-items: center;
    cursor: pointer;
    transition:
      border-color 0.2s,
      background 0.2s,
      box-shadow 0.2s;
    box-sizing: border-box;
  }

  .node:disabled {
    cursor: default;
  }

  .infra-node {
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--node-color) 40%, transparent);
    background: #0b1311;
    box-shadow:
      0 0 0 4px rgba(5, 7, 6, 0.9),
      0 0 22px -6px var(--node-color);
  }

  .service-node {
    border: 1px solid color-mix(in srgb, var(--node-color) 55%, transparent);
    background: #0b1311;
    transform: rotate(45deg);
    box-shadow:
      0 0 0 3px rgba(5, 7, 6, 0.92),
      0 0 20px -6px var(--node-color);
  }

  .service-node.selected {
    border-color: var(--node-color);
    background: color-mix(in srgb, var(--node-color) 12%, transparent);
  }

  .glyph {
    width: 12px;
    height: 12px;
    background: repeating-linear-gradient(180deg, var(--node-color) 0 2px, transparent 2px 4px);
    border-left: 1px solid var(--node-color);
  }

  .glyph-disk {
    width: 13px;
    height: 11px;
    border-left: none;
  }

  .glyph-globe {
    width: 13px;
    height: 13px;
    border: 1px solid var(--node-color);
    border-radius: 50%;
    background: linear-gradient(0deg, transparent 45%, var(--node-color) 45%, var(--node-color) 55%, transparent 55%);
  }

  .service-glyph {
    width: 9px;
    height: 9px;
    background: var(--node-color);
    box-shadow: 0 0 9px var(--node-color);
  }

  .service-glyph.round {
    border-radius: 50%;
  }

  .node-label {
    position: absolute;
    left: 50%;
    font: 500 7.5px/1.4 var(--font-mono);
    white-space: nowrap;
  }

  .infra-label {
    transform: translateX(-50%);
    letter-spacing: 0.1em;
    color: rgba(160, 196, 187, 0.75);
  }

  .service-label {
    transform: translateX(-50%) rotate(-45deg);
    letter-spacing: 0.08em;
    color: rgba(160, 196, 187, 0.62);
  }

  .service-label.selected {
    color: var(--text-primary);
  }

  .zoom-controls {
    position: absolute;
    right: 10px;
    bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px;
    border: 1px solid var(--line-hairline);
    background: rgba(7, 12, 11, 0.85);
  }

  .zoom-controls button {
    all: unset;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    font: 600 11px/1 var(--font-mono);
    color: rgba(190, 214, 206, 0.75);
    cursor: pointer;
    transition: color 0.15s;
  }

  .zoom-controls button:hover {
    color: var(--accent-teal);
  }

  .zoom-value {
    width: 34px;
    text-align: center;
    font: 500 8px/1 var(--font-mono);
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
</style>
