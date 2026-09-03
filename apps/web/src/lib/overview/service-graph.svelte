<script lang="ts">
  import { appState } from '../state/app-state.svelte'
  import { buildGraphNodes, buildLinks, buildTravellingPackets } from './graph'

  const teal = '#4fd6b8'
  const amber = '#e07b28'

  const nodes = $derived(buildGraphNodes(appState.svcId, teal, amber))
  const links = $derived(buildLinks(teal, amber))
  const packets = $derived(buildTravellingPackets(links))

  const lastLoad = $derived(Math.round(appState.series.a[appState.series.a.length - 1]))
  const donutLoadDasharray = $derived(`${Math.round(lastLoad * 2.6)} 440`)

  function selectService(id: string) {
    appState.screen = 'service'
    appState.svcId = id
    appState.navOpen = false
  }

  function selectHost(hostName: string) {
    appState.screen = 'service'
    appState.navOpen = true
    appState.svcQ = hostName
  }
</script>

<div class="graph">
  <svg viewBox="0 0 820 420">
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

<style>
  .graph {
    position: relative;
    width: 100%;
    aspect-ratio: 820 / 420;
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
    transition: all 0.2s;
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
</style>
