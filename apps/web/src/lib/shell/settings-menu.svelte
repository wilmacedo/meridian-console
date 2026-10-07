<script lang="ts">
  import { orbQuality, setOrbQuality, type OrbQuality } from '../core/orb-quality.svelte'
  import { setSound, sound } from '../sound/sfx.svelte'
  import { MODE_LABELS, PALETTE_LABELS, type PaletteId, type ThemeMode } from '../theme/palettes'
  import { live } from '../live/stream.svelte'
  import { hasLightVariant, theme } from '../theme/theme.svelte'
  import { MODULES } from '../modules'
  import { close } from '../windows/window-manager.svelte'
  import { layout } from '../workspace/layout.svelte'
  import { LAYOUT_MODES, type LayoutMode } from '../workspace/layout-mode'
  import { isHidden, isModuleHidden, toggleHidden, toggleModuleHidden } from '../workspace/prefs.svelte'

  let { open = $bindable(false) }: { open: boolean } = $props()

  const modes = Object.keys(MODE_LABELS) as ThemeMode[]
  const palettes = Object.keys(PALETTE_LABELS) as PaletteId[]
  const qualities: { id: OrbQuality; label: string }[] = [
    { id: 'high', label: 'High' },
    { id: 'low', label: 'Low' },
  ]
  const layoutLabels: Record<LayoutMode, string> = { auto: 'Auto · by screen shape', side: 'Side rails', stacked: 'Top and bottom' }
  const modeLocked = $derived(!hasLightVariant(theme.palette))
</script>

<svelte:window onpointerdown={(e) => open && !(e.target as Element).closest('.settings') && (open = false)} />

<div class="settings">
  <button class="trigger" class:open aria-label="Settings" aria-expanded={open} onclick={() => (open = !open)}>
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
      <path d="M2 4.5h12M2 11.5h12" />
      <circle cx="10.5" cy="4.5" r="1.7" fill="rgb(var(--nx-pn))" />
      <circle cx="5.5" cy="11.5" r="1.7" fill="rgb(var(--nx-pn))" />
    </svg>
  </button>
  {#if open}
    <div class="menu" role="menu">
      <div class="group" class:locked={modeLocked}>
        <span class="title">MODE</span>
        {#each modes as m}
          <button role="menuitemradio" aria-checked={theme.mode === m} disabled={modeLocked} class:on={theme.mode === m} onclick={() => (theme.mode = m)}>
            <i class="dot"></i>{MODE_LABELS[m]}{m === 'auto' ? ' · by clock' : ''}
          </button>
        {/each}
      </div>
      <div class="group">
        <span class="title">PALETTE</span>
        {#each palettes as p}
          <button role="menuitemradio" aria-checked={theme.palette === p} class:on={theme.palette === p} onclick={() => (theme.palette = p)}>
            <i class="dot"></i>{PALETTE_LABELS[p]}
          </button>
        {/each}
      </div>
      <div class="group">
        <span class="title">LAYOUT</span>
        {#each LAYOUT_MODES as m (m)}
          <button role="menuitemradio" aria-checked={layout.mode === m} class:on={layout.mode === m} onclick={() => (layout.mode = m)}>
            <i class="dot"></i>{layoutLabels[m]}
          </button>
        {/each}
      </div>
      <div class="group">
        <span class="title">ORB</span>
        {#each qualities as q (q.id)}
          <button role="menuitemradio" aria-checked={orbQuality.value === q.id} class:on={orbQuality.value === q.id} onclick={() => setOrbQuality(q.id)}>
            <i class="dot"></i>{q.label}
          </button>
        {/each}
      </div>
      <div class="group">
        <span class="title">SOUND</span>
        <button role="menuitemcheckbox" aria-checked={sound.on} class:on={sound.on} onclick={() => setSound(!sound.on)}>
          <i class="dot"></i>Effects
        </button>
      </div>
      <div class="group">
        <span class="title">DOCK</span>
        {#each MODULES.filter((m) => m.id !== 'core') as m (m.id)}
          <button
            role="menuitemcheckbox"
            aria-checked={!isModuleHidden(m.id)}
            class:on={!isModuleHidden(m.id)}
            onclick={() => {
              toggleModuleHidden(m.id)
              if (isModuleHidden(m.id)) close(m.id)
            }}
          >
            <i class="dot"></i>{m.label}
          </button>
        {/each}
      </div>
      {#if live.services.length}
        <div class="group">
          <span class="title">SERVICES</span>
          {#each live.services as svc (svc.id)}
            <button role="menuitemcheckbox" aria-checked={!isHidden(svc.id)} class:on={!isHidden(svc.id)} onclick={() => toggleHidden(svc.id)}>
              <i class="dot"></i>{svc.name}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .settings {
    position: absolute;
    top: 12px;
    right: 18px;
    z-index: 40;
  }
  .trigger {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    padding: 0;
    cursor: pointer;
    background: rgba(var(--nx-mu), 0.08);
    border: 1px solid rgba(var(--nx-ac), 0.35);
    border-radius: 8px;
    color: rgb(var(--nx-ac));
  }
  .trigger:hover,
  .trigger.open {
    background: rgba(var(--nx-mu), 0.22);
    color: rgb(var(--nx-fg));
  }
  .menu {
    position: absolute;
    top: 36px;
    right: 0;
    width: 190px;
    max-height: calc(100vh - 60px);
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: linear-gradient(180deg, rgba(var(--nx-pn), 0.88), rgba(var(--nx-pn), 0.92));
    backdrop-filter: blur(18px) saturate(1.4);
    border: 1px solid rgba(var(--nx-hi), 0.2);
    border-radius: 12px;
    box-shadow: 0 26px 70px rgba(var(--nx-sh), 0.5);
    animation: nx-sub 0.2s ease both;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .group.locked {
    opacity: 0.45;
  }
  .title {
    padding: 0 6px 4px;
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(var(--nx-ac), 0.55);
  }
  .group button {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px;
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    font: 400 10.5px/1 var(--font-mono);
    letter-spacing: 0.06em;
    color: rgba(var(--nx-ac), 0.75);
  }
  .group button:hover:not(:disabled) {
    background: rgba(var(--nx-mu), 0.14);
    color: rgb(var(--nx-fg));
  }
  .group button:disabled {
    cursor: default;
  }
  .group button.on {
    color: rgb(var(--nx-fg));
  }
  .dot {
    width: 5px;
    height: 5px;
    border: 1px solid rgba(var(--nx-ac), 0.7);
    transform: rotate(45deg);
  }
  .on .dot {
    background: rgb(var(--nx-ac));
    box-shadow: 0 0 6px rgb(var(--nx-ac));
  }
</style>
