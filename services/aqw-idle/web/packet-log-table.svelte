<script lang="ts">
  import { scan } from './scanner'
  import { parseChatMessage } from './chat'
  import type { LogEntry } from './console-state.svelte'

  interface Props {
    rows: LogEntry[]
    selectedId: number
    decode: boolean
    onPick: (id: number) => void
  }

  const { rows, selectedId, decode, onPick }: Props = $props()

  function levelClass(lvl: string) {
    return `lvl-${lvl.toLowerCase()}`
  }

  function dirClass(dir: string) {
    if (dir === 'IN') return 'in'
    if (dir === 'OUT') return 'out'
    return 'local'
  }

  const legend = [
    { name: '%xt / scope', class: 'tok-proto' },
    { name: 'command', class: 'tok-cmd' },
    { name: 'numeric arg', class: 'tok-num' },
    { name: '%XX escape', class: 'tok-esc-raw' },
    { name: 'delimiter', class: 'tok-sep' },
  ]
</script>

<div class="log-panel">
  <div class="head-row">
    <div>SEQ</div>
    <div>TIME</div>
    <div>LVL</div>
    <div>DIR</div>
    <div>PAYLOAD</div>
  </div>

  <div class="body">
    {#each rows as row, i (row.id)}
      {@const chat = parseChatMessage(row.raw)}
      <button type="button" class="row" class:selected={row.id === selectedId} class:tinted={i % 2 === 1} onclick={() => onPick(row.id)}>
        <span class="seq">{row.id}</span>
        <span class="time">{row.t}</span>
        <span class="lvl-chip {levelClass(row.lvl)}">{row.lvl}</span>
        <span class="dir {dirClass(row.dir)}">{row.dir}</span>
        <span class="payload">
          {#if chat}
            <span class="chat-line" class:whisper={chat.kind === 'whisper'}>
              <span class="chat-chan">[{chat.channel}]</span>
              <span class="chat-user">{chat.from}</span>
              {#if chat.kind === 'whisper'}
                <span class="chat-arrow">→</span>
                <span class="chat-user">{chat.to}</span>
              {/if}
              <span class="chat-colon">:</span>
              <span class="chat-msg">{chat.message}</span>
            </span>
          {:else}
            {#each scan(row.raw) as token, ti (ti)}
              {#if token.kind === 'esc'}
                <span class="tok-esc" class:decoded={decode}>{decode ? token.dec : token.text}</span>
              {:else}
                <span class="tok-{token.kind}">{token.text}</span>
              {/if}
            {/each}
          {/if}
        </span>
      </button>
    {/each}
  </div>

  <div class="legend">
    <span class="legend-title">TOKENS</span>
    <div class="legend-items">
      {#each legend as item (item.name)}
        <span class="legend-item">
          <span class="swatch {item.class}">Aa</span>
          <span class="legend-name">{item.name}</span>
        </span>
      {/each}
    </div>
  </div>
</div>

<style>
  .log-panel {
    flex: 1 1 380px;
    min-width: 0;
    min-height: 280px;
    border: 1px solid rgba(var(--nx-ac), 0.16);
    background: rgba(var(--nx-sh), 0.55);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .head-row {
    display: grid;
    grid-template-columns: 52px 78px 46px 34px 1fr;
    gap: 10px;
    padding: 8px 12px;
    font: 600 7.5px/1 var(--font-mono);
    letter-spacing: 0.18em;
    color: rgba(var(--nx-ac), 0.38);
    border-bottom: 1px solid rgba(var(--nx-ac), 0.16);
  }

  .body {
    height: 392px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .row {
    all: unset;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 52px 78px 46px 34px 1fr;
    gap: 10px;
    align-items: start;
    width: 100%;
    padding: 5px 12px;
    border-bottom: 1px solid rgba(var(--nx-ac), 0.05);
    cursor: pointer;
    background: transparent;
    transition: background 0.15s;
  }

  .row.tinted {
    background: rgba(var(--nx-hi), 0.012);
  }

  .row.selected {
    background: rgba(var(--nx-ac), 0.09);
  }

  .seq {
    font: 500 9px/1.7 var(--font-mono);
    color: rgba(var(--nx-ac), 0.35);
  }

  .time {
    font: 500 9px/1.7 var(--font-mono);
    color: rgba(var(--nx-ac), 0.55);
  }

  .lvl-chip {
    padding: 1px 0;
    text-align: center;
    border: 1px solid;
    font: 600 7.5px/1.6 var(--font-mono);
    letter-spacing: 0.08em;
  }

  .lvl-pkt {
    border-color: color-mix(in srgb, rgb(var(--nx-ac)) 33%, transparent);
    color: rgb(var(--nx-ac));
  }

  .lvl-info {
    border-color: rgba(var(--nx-ac), 0.33);
    color: rgba(var(--nx-ac), 0.85);
  }

  .lvl-warn {
    border-color: color-mix(in srgb, #ffd34d 33%, transparent);
    color: #ffd34d;
  }

  .lvl-err {
    border-color: color-mix(in srgb, #ff6b8a 33%, transparent);
    color: #ff6b8a;
  }

  .lvl-drop {
    border-color: rgba(var(--nx-ac), 0.18);
    color: rgba(var(--nx-ac), 0.45);
  }

  .dir {
    font: 600 8px/1.7 var(--font-mono);
    letter-spacing: 0.06em;
  }

  .dir.in {
    color: rgb(var(--nx-ac));
  }

  .dir.out {
    color: #ffd34d;
  }

  .dir.local {
    color: rgba(var(--nx-ac), 0.3);
  }

  .payload {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    font: 500 10px/1.55 var(--font-mono);
    word-break: break-all;
    text-align: left;
  }

  .tok-sep {
    flex: none;
    color: rgba(var(--nx-ac), 0.28);
  }

  .tok-proto {
    flex: none;
    padding: 0 4px;
    background: color-mix(in srgb, rgb(var(--nx-ac)) 13%, transparent);
    border: 1px solid color-mix(in srgb, rgb(var(--nx-ac)) 33%, transparent);
    color: rgb(var(--nx-ac));
    letter-spacing: 0.08em;
  }

  .tok-cmd {
    flex: none;
    color: rgb(var(--nx-fg));
    font-weight: 600;
  }

  .tok-num {
    flex: none;
    color: #ffd34d;
  }

  .tok-word {
    flex: none;
    color: rgba(var(--nx-ac), 0.85);
  }

  .tok-esc {
    flex: none;
    padding: 0 3px;
    margin: 0 1px;
    color: #ffd34d;
    background: rgba(255, 211, 77, 0.16);
    font-size: 8.5px;
  }

  .tok-esc.decoded {
    padding: 0;
    margin: 0;
    background: transparent;
    border-bottom: 1px dashed rgba(255, 211, 77, 0.55);
    font-size: 10px;
  }

  .chat-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
  }

  .chat-chan {
    flex: none;
    margin-right: 6px;
    color: rgba(var(--nx-ac), 0.55);
  }

  .chat-user {
    flex: none;
    font-weight: 600;
    color: rgb(var(--nx-ac));
  }

  .chat-arrow {
    flex: none;
    margin: 0 5px;
    color: rgba(var(--nx-ac), 0.4);
  }

  .chat-colon {
    flex: none;
    margin-right: 5px;
    color: rgba(var(--nx-ac), 0.4);
  }

  .chat-msg {
    color: rgb(var(--nx-fg));
  }

  .chat-line.whisper .chat-user {
    color: #bfa8ff;
  }

  .chat-line.whisper .chat-msg {
    color: #bfa8ff;
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-top: 1px solid rgba(var(--nx-ac), 0.16);
    flex: none;
  }

  .legend-title {
    font: 600 7.5px/1 var(--font-mono);
    letter-spacing: 0.18em;
    color: rgba(var(--nx-ac), 0.38);
  }

  .legend-items {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .swatch {
    padding: 1px 5px;
    font: 600 8px/1.5 var(--font-mono);
  }

  .swatch.tok-proto {
    font: 600 8px/1.5 var(--font-mono);
  }

  .swatch.tok-cmd {
    font: 600 9px/1.5 var(--font-mono);
  }

  .swatch.tok-num {
    font: 500 9px/1.5 var(--font-mono);
  }

  .swatch.tok-esc-raw {
    padding: 0 3px;
    background: rgba(255, 211, 77, 0.16);
    color: #ffd34d;
    font: 500 8.5px/1.5 var(--font-mono);
  }

  .swatch.tok-sep {
    font: 500 9px/1.5 var(--font-mono);
  }

  .legend-name {
    font: 500 8px/1 var(--font-mono);
    letter-spacing: 0.1em;
    color: rgba(var(--nx-ac), 0.45);
  }
</style>
