<script lang="ts">
  import { onMount } from 'svelte'

  interface Pairing {
    state: 'down' | 'connecting' | 'pairing' | 'connected'
    message?: string
    phone?: string
    qrSvg?: string
  }

  const POLL_MS = 2_000

  let pairing = $state<Pairing>({ state: 'connecting' })

  const headline = $derived(
    {
      down: pairing.message ?? 'The bridge is not running',
      connecting: 'Connecting to WhatsApp…',
      pairing: 'Scan this code with the phone',
      connected: pairing.phone ? `Linked to +${pairing.phone}` : 'Linked',
    }[pairing.state],
  )

  async function refresh() {
    try {
      const response = await fetch('/api/services/whatsapp/pairing')
      if (response.ok) pairing = await response.json()
    } catch {
      pairing = { state: 'down', message: 'Meridian is not answering' }
    }
  }

  onMount(() => {
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer)
  })
</script>

<div class="wa">
  <p class="headline" class:ok={pairing.state === 'connected'}>{headline}</p>
  {#if pairing.qrSvg}
    <!-- Generated on the server from the code WhatsApp issued; it never contains page or message text. -->
    <div class="qr">{@html pairing.qrSvg}</div>
    <p class="hint">WhatsApp → Settings → Linked devices → Link a device</p>
  {:else if pairing.state === 'connected'}
    <p class="hint">NOX can read and, with your confirmation, send messages. Ask it by voice.</p>
  {/if}
</div>

<style>
  .wa {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 14px;
    height: 100%;
    padding: 24px;
    font-family: var(--nx-mono, ui-monospace, monospace);
  }
  .headline {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.08em;
    color: rgb(var(--nx-fg));
  }
  .headline.ok {
    color: rgb(var(--nx-ac));
  }
  .hint {
    margin: 0;
    font-size: 11px;
    color: rgba(var(--nx-ac), 0.55);
    text-align: center;
  }
  .qr {
    width: 220px;
    height: 220px;
    padding: 8px;
    background: #fff;
    border-radius: 4px;
  }
  .qr :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
