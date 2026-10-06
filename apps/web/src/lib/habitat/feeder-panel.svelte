<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { feed, fetchFeederStatus, type FeederStatus } from './feeder-control'

  type Phase = 'idle' | 'confirming' | 'sending' | 'waiting'

  const MAX_PORTIONS = 5
  const POLL_MS = 30_000
  const REPORT_POLL_MS = 2000
  const REPORT_ATTEMPTS = 8
  const CONFIRM_TIMEOUT_MS = 5000
  const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

  let status = $state<FeederStatus | undefined>()
  let unreachable = $state(false)
  let portions = $state(1)
  let phase = $state<Phase>('idle')
  let outcome = $state<{ text: string; ok: boolean } | undefined>()

  let pollTimer: ReturnType<typeof setInterval> | undefined
  let confirmTimer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false

  async function refresh() {
    try {
      status = await fetchFeederStatus()
      unreachable = false
    } catch {
      unreachable = true
    }
  }

  function clockOf(iso: string): string {
    const date = new Date(iso)
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return date.toDateString() === new Date().toDateString()
      ? time
      : `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} ${time}`
  }

  const isStale = (iso: string) => Date.now() - new Date(iso).getTime() > STALE_AFTER_MS

  const lastFeedText = $derived.by(() => {
    const last = status?.lastFeed
    if (!last) return '—'
    const what = last.portions === 0 ? 'FAILED' : `${last.portions} PORTION${last.portions > 1 ? 'S' : ''}`
    return `${what} · ${last.source.toUpperCase()} · ${clockOf(last.at)}`
  })

  function askConfirmation() {
    outcome = undefined
    phase = 'confirming'
    confirmTimer = setTimeout(cancel, CONFIRM_TIMEOUT_MS)
  }

  function cancel() {
    clearTimeout(confirmTimer)
    phase = 'idle'
  }

  async function confirmFeed() {
    clearTimeout(confirmTimer)
    // Compare against the device's own previous timestamp so clock skew between machines cannot matter.
    const baseline = status?.lastFeed?.at
    phase = 'sending'
    try {
      await feed(portions)
    } catch {
      outcome = { text: 'COMMAND REJECTED', ok: false }
      phase = 'idle'
      return
    }

    phase = 'waiting'
    for (let i = 0; i < REPORT_ATTEMPTS && !destroyed; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, REPORT_POLL_MS))
      await refresh()
      const last = status?.lastFeed
      if (last && last.at !== baseline) {
        outcome = last.portions > 0 ? { text: `SERVED ${last.portions}`, ok: true } : { text: 'FEEDING FAILED', ok: false }
        phase = 'idle'
        return
      }
    }
    if (destroyed) return
    outcome = { text: 'NO REPORT FROM DEVICE', ok: false }
    phase = 'idle'
  }

  onMount(() => {
    refresh()
    pollTimer = setInterval(refresh, POLL_MS)
  })

  onDestroy(() => {
    destroyed = true
    clearInterval(pollTimer)
    clearTimeout(confirmTimer)
  })
</script>

<div class="panel">
  <div class="head">
    <span class="title">FEEDER</span>
    <span class="chip" class:err={unreachable}>{unreachable ? 'UNREACHABLE' : 'ONLINE'}</span>
  </div>

  <div class="rows">
    <div class="row">
      <span class="key">LAST FEED</span>
      <span class="value" class:err={status?.lastFeed?.portions === 0}>{lastFeedText}</span>
    </div>
    <div class="row">
      <span class="key">BATTERY</span>
      <span class="value" class:amber={status?.battery?.value !== 'high'}>
        {status?.battery ? status.battery.value.toUpperCase() : '—'}
      </span>
    </div>
    <div class="row">
      <span class="key">FOOD</span>
      <span class="value" class:amber={status?.foodStorage?.value !== 'full'}>
        {status?.foodStorage ? status.foodStorage.value.toUpperCase() : '—'}
        {#if status?.foodStorage && isStale(status.foodStorage.at)}<span class="stale"> · STALE</span>{/if}
      </span>
    </div>
    {#if status?.blocked}
      <div class="row">
        <span class="key">DISPENSER</span>
        <span class="value err">CLOGGED</span>
      </div>
    {/if}
  </div>

  <div class="control">
    <div class="stepper">
      <button type="button" aria-label="Fewer portions" disabled={portions <= 1 || phase !== 'idle'} onclick={() => (portions -= 1)}>–</button>
      <span class="count">{portions}<span class="unit"> PORTION{portions > 1 ? 'S' : ''}</span></span>
      <button type="button" aria-label="More portions" disabled={portions >= MAX_PORTIONS || phase !== 'idle'} onclick={() => (portions += 1)}>+</button>
    </div>

    {#if phase === 'confirming'}
      <div class="confirm">
        <button type="button" class="feed armed" onclick={confirmFeed}>CONFIRM · {portions}</button>
        <button type="button" class="cancel" onclick={cancel}>CANCEL</button>
      </div>
    {:else}
      <button type="button" class="feed" disabled={phase !== 'idle' || unreachable} onclick={askConfirmation}>
        {phase === 'sending' ? 'SENDING…' : phase === 'waiting' ? 'WAITING FOR DEVICE…' : 'FEED NOW'}
      </button>
    {/if}

    {#if outcome}
      <div class="outcome" class:ok={outcome.ok} class:err={!outcome.ok}>{outcome.text}</div>
    {/if}
  </div>
</div>

<style>
  .panel {
    border: 1px solid var(--line-hairline);
    background: var(--bg-inset);
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line-hairline);
  }

  .title {
    font: 600 10px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--text-primary);
  }

  .chip {
    padding: 3px 7px;
    border: 1px solid var(--line-strong);
    font: 500 8.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--accent-teal);
  }

  .chip.err {
    border-color: var(--state-err);
    color: var(--state-err);
  }

  .rows {
    padding: 6px 14px;
  }

  .row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line-row);
    font: 500 9px/1.3 var(--font-mono);
    letter-spacing: 0.08em;
  }

  .key {
    flex: none;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .value {
    text-align: right;
    color: var(--text-primary);
  }

  .amber {
    color: var(--accent-amber);
  }

  .err {
    color: var(--state-err);
  }

  .stale {
    color: var(--text-muted);
  }

  .control {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px 14px;
    border-top: 1px solid var(--line-hairline);
  }

  .stepper {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .stepper button {
    all: unset;
    width: 40px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid var(--line-strong);
    font: 500 14px/1 var(--font-mono);
    color: var(--accent-teal);
    cursor: pointer;
  }

  .stepper button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .count {
    font: 600 20px/1 var(--font-mono);
    color: var(--text-primary);
  }

  .unit {
    margin-left: 4px;
    font-size: 8px;
    letter-spacing: 0.14em;
    color: var(--text-muted);
  }

  .feed,
  .cancel {
    all: unset;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    height: 34px;
    border: 1px solid var(--line-strong);
    font: 600 9px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--accent-teal);
    cursor: pointer;
    transition: all 0.2s;
  }

  .feed:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .feed.armed {
    border-color: var(--accent-amber);
    background: rgba(224, 123, 40, 0.12);
    color: var(--accent-amber);
  }

  .confirm {
    display: grid;
    grid-template-columns: 1fr 80px;
    gap: 8px;
  }

  .cancel {
    border-color: var(--line-hairline);
    color: var(--text-muted);
  }

  .outcome {
    font: 600 9px/1 var(--font-mono);
    letter-spacing: 0.14em;
    text-align: center;
  }

  .outcome.ok {
    color: var(--accent-teal);
  }
</style>
