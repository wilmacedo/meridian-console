<script lang="ts">
  import { onMount } from 'svelte'
  import { finishBoot } from './lib/agent/agent-state.svelte'
  import { denyApproval } from './lib/agent/approval.svelte'
  import ApprovalCard from './lib/shell/approval-card.svelte'
  import { startClock } from './lib/clock.svelte'
  import CoreLayer from './lib/core/core-layer.svelte'
  import { cancelPending } from './lib/dock/dock.svelte'
  import DragGhost from './lib/dock/drag-ghost.svelte'
  import PendingPin from './lib/dock/pending-pin.svelte'
  import Rail from './lib/dock/rail.svelte'
  import BottomDock from './lib/shell/bottom-dock.svelte'
  import CarBar from './lib/shell/car-bar.svelte'
  import CarCore from './lib/shell/car-core.svelte'
  import CarTiles from './lib/shell/car-tiles.svelte'
  import { isCar } from './lib/shell/car.svelte'
  import Header from './lib/shell/header.svelte'
  import { handleShortcut } from './lib/shell/keyboard'
  import SettingsButton from './lib/shell/settings-button.svelte'
  import WorkspaceBanner from './lib/shell/workspace-banner.svelte'
  import WorkspaceChip from './lib/shell/workspace-chip.svelte'
  import { shellUi } from './lib/shell/shell-ui.svelte'
  import Stage from './lib/windows/stage.svelte'
  import StateLabel from './lib/shell/state-label.svelte'
  import TaskCard from './lib/shell/task-card.svelte'
  import { sendToServer, startStream } from './lib/live/stream.svelte'
  import { cancelListening, continueListening, haltIfBusy } from './lib/voice/microphone.svelte'
  import { retryPlayback, setPlaybackFinished, setPlaybackSpoken, unlockAudio } from './lib/voice/voice-player.svelte'
  import { runCommand } from './lib/workspace/commands'
  import { playBootFx } from './lib/workspace/switch-fx.svelte'
  import { layout, configureScale } from './lib/workspace/layout.svelte'
  import { prefs } from './lib/workspace/prefs.svelte'
  import { currentIndex, currentWorkspace, deviceWorkspaceId, loadWorkspace, receiveWorkspace, refreshWorkspaces, startWorkspaceSync } from './lib/workspace/workspace-sync.svelte'
  import { activeVariant, applyTheme, darkVariant } from './lib/theme/theme.svelte'

  function closeOverlay(): boolean {
    if (shellUi.workspacesOpen) {
      shellUi.workspacesOpen = false
      return true
    }
    return denyApproval() || cancelListening() || haltIfBusy() || cancelPending()
  }

  $effect(() => configureScale(prefs.uiScale, prefs.carplay))
  $effect(() => applyTheme(document.documentElement, activeVariant(), darkVariant()))

  onMount(() => {
    const stopClock = startClock()
    finishBoot()
    setPlaybackFinished((turn) => sendToServer({ type: 'speech_done', turn }))
    setPlaybackSpoken(() => void continueListening())
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
      void refreshWorkspaces().then(() => {
        const w = currentWorkspace()
        if (w && !stopped) void playBootFx(w.name, String(currentIndex() + 1).padStart(2, '0'))
      })
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

<div class="root" class:scaled={layout.scale !== 1} style:width={layout.scale !== 1 ? `${layout.w}px` : undefined} style:height={layout.scale !== 1 ? `${layout.h}px` : undefined} style:transform={layout.scale !== 1 ? `scale(${layout.scale})` : undefined}>
  <CoreLayer />
  {#if !isCar()}<Header />{/if}
  <StateLabel />
  <Stage />
  {#if isCar()}
    <CarCore />
    <CarTiles />
    <CarBar />
  {:else}
    <PendingPin />
    <Rail rail="L" />
    <Rail rail="R" />
  {/if}
  <TaskCard />
  {#if !isCar()}
    <BottomDock />
    <SettingsButton />
  {/if}
  <WorkspaceChip />
  <WorkspaceBanner />
  <ApprovalCard />
  <DragGhost />
</div>

<style>
  .root {
    position: fixed;
    inset: 0;
    transform-origin: 0 0;
    overflow: hidden;
    background: rgb(var(--nx-bg));
  }
  /* Enlarged: it is laid out at a smaller size and scaled up to fill the window, so it is not stretched by inset. */
  .root.scaled {
    inset: auto;
    left: 0;
    top: 0;
  }
</style>
