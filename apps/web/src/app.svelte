<script lang="ts">
  import { onMount } from 'svelte'
  import { finishBoot } from './lib/agent/agent-state.svelte'
  import { startClock } from './lib/clock.svelte'
  import CoreLayer from './lib/core/core-layer.svelte'
  import { cancelPending } from './lib/dock/dock.svelte'
  import DragGhost from './lib/dock/drag-ghost.svelte'
  import PendingPin from './lib/dock/pending-pin.svelte'
  import Rail from './lib/dock/rail.svelte'
  import BottomDock from './lib/shell/bottom-dock.svelte'
  import Header from './lib/shell/header.svelte'
  import { handleShortcut } from './lib/shell/keyboard'
  import SettingsMenu from './lib/shell/settings-menu.svelte'
  import Stage from './lib/windows/stage.svelte'
  import StateLabel from './lib/shell/state-label.svelte'
  import { sendToServer, startStream } from './lib/live/stream.svelte'
  import { retryPlayback, setPlaybackFinished, unlockAudio } from './lib/voice/voice-player.svelte'
  import { runCommand } from './lib/workspace/commands'
  import { deviceWorkspaceId, loadWorkspace, receiveWorkspace, startWorkspaceSync } from './lib/workspace/workspace-sync.svelte'
  import { activeVariant, applyTheme, darkVariant } from './lib/theme/theme.svelte'

  let settingsOpen = $state(false)

  function closeOverlay(): boolean {
    if (settingsOpen) {
      settingsOpen = false
      return true
    }
    return cancelPending()
  }

  $effect(() => applyTheme(document.documentElement, activeVariant(), darkVariant()))

  onMount(() => {
    const stopClock = startClock()
    finishBoot()
    setPlaybackFinished((turn) => sendToServer({ type: 'speech_done', turn }))
    // Audio can only start after a gesture; the first one unlocks it, and any later one retries queued speech.
    const unlock = (): void => {
      unlockAudio()
      retryPlayback()
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    let stopStream: (() => void) | undefined
    let stopSync: (() => void) | undefined
    let stopped = false
    void loadWorkspace(deviceWorkspaceId()).then((id) => {
      if (stopped) return
      stopSync = startWorkspaceSync()
      stopStream = startStream(id, { onWorkspace: receiveWorkspace, onCommand: runCommand })
    })
    return () => {
      stopped = true
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      stopClock()
      stopSync?.()
      stopStream?.()
    }
  })
</script>

<svelte:window onkeydown={(e) => handleShortcut(e, closeOverlay)} />

<div class="root">
  <CoreLayer />
  <Header />
  <StateLabel />
  <Stage />
  <PendingPin />
  <Rail rail="L" />
  <Rail rail="R" />
  <BottomDock />
  <SettingsMenu bind:open={settingsOpen} />
  <DragGhost />
</div>

<style>
  .root {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: rgb(var(--nx-bg));
  }
</style>
