<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { connectFeederCamera, type CameraConnection } from './feeder-camera'

  type Status = 'connecting' | 'live' | 'error'

  let status = $state<Status>('connecting')
  let muted = $state(true)
  let video: HTMLVideoElement | undefined = $state()
  let camera: CameraConnection | undefined
  let attempt = 0

  async function connect() {
    const current = ++attempt
    camera?.connection.close()
    camera = undefined
    status = 'connecting'

    try {
      const next = await connectFeederCamera()
      if (current !== attempt) {
        next.connection.close()
        return
      }
      camera = next
      next.connection.addEventListener('connectionstatechange', () => {
        if (current !== attempt) return
        const state = next.connection.connectionState
        if (state === 'connected') status = 'live'
        else if (state === 'failed' || state === 'disconnected' || state === 'closed') status = 'error'
      })
      if (video) video.srcObject = next.stream
    } catch {
      if (current === attempt) status = 'error'
    }
  }

  onMount(connect)

  onDestroy(() => {
    attempt += 1
    camera?.connection.close()
  })
</script>

<div class="panel">
  <div class="head">
    <span class="title">FEEDER CAM</span>
    <div class="status">
      <button type="button" class="sound" class:on={!muted} onclick={() => (muted = !muted)}>
        {muted ? 'SOUND OFF' : 'SOUND ON'}
      </button>
      <span class="chip" class:live={status === 'live'} class:err={status === 'error'}>
        {status === 'live' ? 'LIVE' : status === 'error' ? 'OFFLINE' : 'CONNECTING'}
      </span>
    </div>
  </div>

  <div class="frame">
    <!-- Starts muted: browsers only autoplay muted video, and unmuting needs the click above. -->
    <video bind:this={video} bind:muted autoplay playsinline></video>
    {#if status !== 'live'}
      <div class="overlay">
        {#if status === 'error'}
          <button type="button" onclick={connect}>RETRY</button>
        {:else}
          <span>ESTABLISHING LINK</span>
        {/if}
      </div>
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

  .status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .chip {
    padding: 3px 7px;
    border: 1px solid var(--line-hairline);
    font: 500 8.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--text-muted);
  }

  .chip.live {
    border-color: var(--line-strong);
    color: var(--accent-teal);
  }

  .chip.err {
    border-color: var(--state-err);
    color: var(--state-err);
  }

  .frame {
    position: relative;
    aspect-ratio: 16 / 9;
    background: #000;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font: 500 9px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--text-muted);
  }

  .sound {
    all: unset;
    padding: 3px 7px;
    border: 1px solid var(--line-hairline);
    font: 500 8.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .sound.on {
    border-color: var(--line-strong);
    color: var(--accent-teal);
  }

  .overlay button {
    all: unset;
    padding: 6px 12px;
    border: 1px solid var(--line-strong);
    font: 500 9px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--accent-teal);
    cursor: pointer;
  }
</style>
