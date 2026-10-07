<script lang="ts">
  import { buildFields } from './derived'
  import { humanDecode, parseChatMessage } from './chat'
  import type { LogEntry } from './console-state.svelte'

  interface Props {
    packet: LogEntry
  }

  const { packet }: Props = $props()

  const chat = $derived(parseChatMessage(packet.raw))
  const decoded = $derived(humanDecode(packet.raw))
  const fields = $derived(
    chat
      ? chat.kind === 'whisper'
        ? [
            { label: 'from', value: chat.from },
            { label: 'to', value: chat.to ?? '' },
            { label: 'message', value: chat.message },
          ]
        : [
            { label: 'channel', value: chat.channel },
            { label: 'username', value: chat.from },
            { label: 'message', value: chat.message },
          ]
      : buildFields(packet.raw),
  )

  const facts = $derived([
    { key: 'SEQ', value: `#${packet.id}` },
    { key: 'TIME', value: packet.t },
    { key: 'CHANNEL', value: packet.chan },
    { key: 'DIRECTION', value: packet.dir === 'IN' ? 'inbound' : packet.dir === 'OUT' ? 'outbound' : 'local' },
    { key: 'BYTES', value: String(packet.raw.length) },
    { key: 'ESCAPES', value: String((packet.raw.match(/%[0-9A-F]{2}/gi) ?? []).length) },
  ])
</script>

<div class="inspector-col">
  <div class="inspector">
    <div class="inspector-title">PACKET INSPECTOR</div>
    <div class="inspector-body">
      <div>
        <div class="section-label">RAW</div>
        <pre class="raw">{packet.raw}</pre>
      </div>
      <div>
        <div class="section-label">DECODED</div>
        <pre class="decoded">{decoded}</pre>
      </div>
      {#each facts as fact (fact.key)}
        <div class="fact-row">
          <span class="fact-key">{fact.key}</span>
          <span class="fact-value">{fact.value}</span>
        </div>
      {/each}
    </div>
  </div>

  <div class="fields">
    <div class="fields-title">FIELDS</div>
    {#each fields as field, i (i)}
      <div class="field-row" class:head={i < 3}>
        <span class="field-label">{field.label}</span>
        <span class="field-value">{field.value}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .inspector-col {
    flex: 1 1 254px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  .inspector {
    border: 1px solid rgba(255, 211, 77, 0.28);
  }

  .inspector-title {
    padding: 11px 13px;
    border-bottom: 1px solid rgba(255, 211, 77, 0.2);
    font: 600 9px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(255, 211, 77, 0.9);
  }

  .inspector-body {
    padding: 12px 13px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-label {
    font: 600 7.5px/1.8 var(--font-mono);
    letter-spacing: 0.18em;
    color: rgba(var(--nx-ac), 0.55);
  }

  .raw,
  .decoded {
    margin: 4px 0 0;
    padding: 9px;
    font: 500 9px/1.7 var(--font-mono);
    white-space: pre-wrap;
    word-break: break-all;
  }

  .raw {
    background: rgba(var(--nx-mu), 0.06);
    border: 1px solid rgba(var(--nx-ac), 0.16);
    color: rgba(var(--nx-ac), 0.9);
  }

  .decoded {
    background: rgba(255, 211, 77, 0.06);
    border: 1px solid rgba(255, 211, 77, 0.2);
    color: #ffd34d;
  }

  .fact-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font: 500 9px/1.5 var(--font-mono);
  }

  .fact-key {
    color: rgba(var(--nx-ac), 0.55);
  }

  .fact-value {
    color: rgba(var(--nx-ac), 0.9);
  }

  .fields {
    border: 1px solid rgba(var(--nx-ac), 0.16);
    padding: 12px 13px;
    flex: none;
  }

  .fields-title {
    font: 600 9px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(var(--nx-ac), 0.8);
    margin-bottom: 8px;
  }

  .field-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 4px 0;
    border-bottom: 1px solid rgba(var(--nx-ac), 0.06);
    font: 500 9px/1.6 var(--font-mono);
    color: rgba(var(--nx-ac), 0.75);
  }

  .field-row.head {
    color: rgb(var(--nx-fg));
  }

  .field-label {
    opacity: 0.55;
  }

  .field-value {
    text-align: right;
    word-break: break-all;
  }
</style>
