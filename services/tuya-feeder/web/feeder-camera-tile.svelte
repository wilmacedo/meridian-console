<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { connectFeederCamera, type CameraConnection } from './feeder-camera'
  import { feeder } from './feeder-state.svelte'

  type Link = 'connecting' | 'live' | 'error'

  let link = $state<Link>('connecting')
  let video: HTMLVideoElement | undefined = $state()
  let now = $state(new Date())
  let camera: CameraConnection | undefined
  let attempt = 0

  async function connect(): Promise<void> {
    const current = ++attempt
    camera?.connection.close()
    camera = undefined
    link = 'connecting'
    try {
      const next = await connectFeederCamera()
      if (current !== attempt) return next.connection.close()
      camera = next
      next.connection.addEventListener('connectionstatechange', () => {
        if (current !== attempt) return
        const state = next.connection.connectionState
        if (state === 'connected') link = 'live'
        else if (state === 'failed' || state === 'disconnected' || state === 'closed') link = 'error'
      })
      if (video) video.srcObject = next.stream
    } catch {
      if (current === attempt) link = 'error'
    }
  }

  const pad = (n: number): string => String(n).padStart(2, '0')
  const clock = $derived(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`)
  const dispensing = $derived(feeder.phase === 'sending' || feeder.phase === 'waiting')

  onMount(() => {
    void connect()
    const timer = setInterval(() => (now = new Date()), 1000)
    return () => clearInterval(timer)
  })

  onDestroy(() => {
    attempt++
    camera?.connection.close()
  })
</script>

<div class="tile nx-dark">
  <!-- Starts muted: browsers only autoplay muted video. -->
  <video bind:this={video} autoplay muted playsinline></video>
  <div class="top left"><span class="rec">● REC</span><span>FEEDER</span></div>
  <div class="top right">{clock}</div>
  {#if dispensing}<div class="dispensing">DISPENSING</div>{/if}
  {#if link !== 'live'}
    <div class="overlay">
      {#if link === 'error'}<button onclick={connect}>RETRY</button>{:else}<span>ESTABLISHING LINK</span>{/if}
    </div>
  {/if}
</div>

<style>
  .tile {
    position: relative;
    aspect-ratio: 16 / 9;
    background: #030a1c;
    border: 1px solid rgba(var(--nx-ac), 0.45);
    border-radius: 11px;
    overflow: hidden;
    animation: nx-sub 0.6s ease 0.2s both;
  }
  video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .top {
    position: absolute;
    top: 10px;
    display: flex;
    gap: 10px;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.06em;
    color: rgb(var(--nx-fg));
  }
  .left {
    left: 12px;
  }
  .right {
    right: 12px;
    color: rgb(var(--nx-ac));
    letter-spacing: 0.1em;
  }
  .rec {
    color: #ff6b8a;
    animation: nx-blink 1.2s ease-in-out infinite;
  }
  .dispensing {
    position: absolute;
    right: 12px;
    bottom: 10px;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgb(var(--nx-bg));
    background: rgb(var(--nx-ac));
    border-radius: 2px;
    padding: 4px 9px;
    animation: nx-blink 0.7s ease-in-out infinite;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(var(--nx-bg), 0.7);
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.22em;
    color: rgba(var(--nx-ac), 0.8);
  }
  .overlay button {
    background: rgba(var(--nx-mu), 0.16);
    border: 1px solid rgba(var(--nx-ac), 0.5);
    border-radius: 6px;
    color: rgb(var(--nx-fg));
    font: inherit;
    letter-spacing: inherit;
    padding: 8px 14px;
    cursor: pointer;
  }
</style>
