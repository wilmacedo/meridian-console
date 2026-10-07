<script lang="ts">
  import { orbQuality, setOrbQuality, type OrbQuality } from '../core/orb-quality.svelte'
  import { live } from '../live/stream.svelte'
  import { setSound, sound } from '../sound/sfx.svelte'
  import { PALETTES, PALETTE_LABELS, type PaletteId, type ThemeMode } from '../theme/palettes'
  import { hasLightVariant, theme } from '../theme/theme.svelte'
  import { close } from '../windows/window-manager.svelte'
  import { layout } from '../workspace/layout.svelte'
  import { LAYOUT_MODES, type LayoutMode } from '../workspace/layout-mode'
  import { clampStrands, STRANDS_MAX, STRANDS_MIN, STRANDS_STEP } from '../workspace/module-order'
  import { isHidden, isModuleHidden, moveModule, orderedModules, prefs, toggleHidden, toggleModuleHidden } from '../workspace/prefs.svelte'
  import { NAME_MAX, nameProblem } from '../workspace/workspace-name'
  import { currentWorkspace, deleteWorkspace, duplicateWorkspace, renameWorkspace, resetWorkspaceSettings, workspaceId, workspaces } from '../workspace/workspace-sync.svelte'
  import SegmentedControl from './segmented-control.svelte'
  import SettingRow from './setting-row.svelte'
  import SettingSection from './setting-section.svelte'
  import SwitchToggle from './switch-toggle.svelte'

  const MODES: { id: ThemeMode; label: string }[] = [
    { id: 'auto', label: 'AUTO' },
    { id: 'dark', label: 'DARK' },
    { id: 'light', label: 'LIGHT' },
  ]
  const LAYOUT_LABELS: Record<LayoutMode, string> = { auto: 'AUTO', side: 'SIDE', stacked: 'STACKED' }
  const QUALITIES: { id: OrbQuality; label: string }[] = [
    { id: 'high', label: 'HIGH' },
    { id: 'low', label: 'LOW' },
  ]
  const DELETE_CONFIRM_MS = 3000

  const name = $derived(currentWorkspace()?.name ?? '')
  const palettes = Object.keys(PALETTES) as PaletteId[]
  const locked = $derived(!hasLightVariant(theme.palette))
  const modeNote = $derived(
    theme.mode === 'auto' ? 'Auto follows daylight · light 07–18h, dark after.' : theme.mode === 'light' && locked ? `${PALETTE_LABELS[theme.palette].toUpperCase()} has no light variant — staying dark.` : `Fixed ${theme.mode} mode for this workspace.`,
  )
  const modules = $derived(orderedModules())

  let draft = $state('')
  let refused = $state<string | undefined>()
  $effect(() => {
    draft = name
    refused = undefined
  })
  const problem = $derived(refused ?? (draft.trim() && draft.trim() !== name ? nameProblem(draft, workspaces.list.filter((w) => w.id !== workspaceId())) : undefined))

  async function commitName(): Promise<void> {
    const next = draft.trim()
    if (!next || next === name) return void (draft = name)
    if (problem) return
    refused = await renameWorkspace(workspaceId(), next)
  }

  let confirmingDelete = $state(false)
  let deleteTimer: ReturnType<typeof setTimeout> | undefined
  const canDelete = $derived(workspaces.list.length > 1 && workspaceId() !== 'default')
  function remove(): void {
    if (!canDelete) return
    if (!confirmingDelete) {
      confirmingDelete = true
      clearTimeout(deleteTimer)
      deleteTimer = setTimeout(() => (confirmingDelete = false), DELETE_CONFIRM_MS)
      return
    }
    clearTimeout(deleteTimer)
    confirmingDelete = false
    void deleteWorkspace(workspaceId())
  }
  $effect(() => () => clearTimeout(deleteTimer))

  function toggleModule(id: (typeof modules)[number]['id']): void {
    toggleModuleHidden(id)
    if (isModuleHidden(id)) close(id)
  }

  const paletteSwatch = (p: PaletteId): { dark: (typeof PALETTES)[PaletteId]['dark']; light?: (typeof PALETTES)[PaletteId]['light'] } => PALETTES[p]
</script>

<div class="settings">
  <div class="scope">
    <span class="tag">SCOPE</span>
    <span class="where">Saved to workspace “{name}”</span>
    <span class="auto"><i></i>AUTOSAVE</span>
  </div>

  <SettingSection title="01 · APPEARANCE" delay={0.16}>
    <SettingRow title="Mode" note={modeNote} wide>
      <SegmentedControl options={MODES} value={theme.mode} disabled={locked && theme.mode !== 'auto'} onPick={(m) => (theme.mode = m)} />
    </SettingRow>
    <div class="palettes-head">
      <span class="title">Palette</span>
      <span class="note">Core, panels and dock accents.</span>
    </div>
    <div class="palettes">
      {#each palettes as p (p)}
        {@const v = paletteSwatch(p)}
        <button class="palette" class:sel={theme.palette === p} onclick={() => (theme.palette = p)}>
          <div class="preview">
            <div class="half" style:background="rgb({v.dark.bg})">
              <span class="ring" style:border-color="rgb({v.dark.ac})" style:box-shadow="0 0 12px rgb({v.dark.ac})"></span>
              <span class="base" style:background="rgb({v.dark.orbB})"></span>
            </div>
            {#if v.light}
              <div class="half" style:background="rgb({v.light.bg})">
                <span class="ring" style:border-color="rgb({v.light.ac})"></span>
                <span class="base" style:background="rgb({v.light.ac})"></span>
              </div>
            {/if}
          </div>
          <div class="caption">
            <span class="plabel">{PALETTE_LABELS[p].toUpperCase()}</span>
            <span class="pnote">{v.light ? 'DARK · LIGHT' : 'DARK ONLY'}</span>
          </div>
        </button>
      {/each}
    </div>
  </SettingSection>

  <SettingSection title="02 · DOCK" delay={0.22}>
    <div class="text">
      <span class="title">Dock items</span>
      <span class="note">Choose what appears in the bottom dock and in which order. Number keys follow this order.</span>
    </div>
    <div class="dock">
      {#each modules as m, i (m.id)}
        {@const core = m.id === 'core'}
        {@const on = core || !isModuleHidden(m.id)}
        <div class="drow" class:off={!on}>
          <span class="n">{String(i + 1).padStart(2, '0')}</span>
          <span class="dname">{m.label}</span>
          <div class="moves">
            <button aria-label="Move up" style:opacity={i ? 1 : 0.25} onclick={() => moveModule(m.id, -1)}>↑</button>
            <button aria-label="Move down" style:opacity={i < modules.length - 1 ? 1 : 0.25} onclick={() => moveModule(m.id, 1)}>↓</button>
          </div>
          <SwitchToggle {on} locked={core} label={m.label} onToggle={() => toggleModule(m.id)} />
        </div>
      {/each}
    </div>
  </SettingSection>

  <SettingSection title="03 · CORE" delay={0.28}>
    <SettingRow title="Strands" note="Density of the neural core." wide>
      <div class="slider">
        <input type="range" min={STRANDS_MIN} max={STRANDS_MAX} step={STRANDS_STEP} value={prefs.strands} oninput={(e) => (prefs.strands = clampStrands(Number(e.currentTarget.value)))} />
        <span>{prefs.strands}</span>
      </div>
    </SettingRow>
    <SettingRow title="Grid" note="Background measurement grid.">
      <SwitchToggle on={prefs.grid} label="Grid" onToggle={() => (prefs.grid = !prefs.grid)} />
    </SettingRow>
  </SettingSection>

  <SettingSection title="04 · WORKSPACE" delay={0.34}>
    <SettingRow title="Name" note="Shown in the switcher, top left." wide>
      <input
        class="name"
        class:bad={problem !== undefined}
        bind:value={draft}
        maxlength={NAME_MAX}
        spellcheck="false"
        onkeydown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') draft = name
        }}
        onblur={() => void commitName()}
      />
    </SettingRow>
    {#if problem}<span class="problem">{problem}</span>{/if}
    <div class="actions">
      <button onclick={() => void duplicateWorkspace()}>DUPLICATE</button>
      <button onclick={resetWorkspaceSettings}>RESET SETTINGS</button>
      <button class="danger" class:armed={confirmingDelete} disabled={!canDelete} onclick={remove}>{confirmingDelete ? 'CLICK AGAIN TO DELETE' : 'DELETE'}</button>
    </div>
  </SettingSection>

  {#if live.services.length}
    <SettingSection title="05 · SERVICES" delay={0.4}>
      <div class="text">
        <span class="title">Registered services</span>
        <span class="note">A retired service leaves the Services window, the dock widget and the header count.</span>
      </div>
      <div class="dock">
        {#each live.services as svc (svc.id)}
          <div class="drow" class:off={isHidden(svc.id)}>
            <span class="n">{svc.mono ?? ''}</span>
            <span class="dname">{svc.name}</span>
            <span></span>
            <SwitchToggle on={!isHidden(svc.id)} label={svc.name} onToggle={() => toggleHidden(svc.id)} />
          </div>
        {/each}
      </div>
    </SettingSection>
  {/if}

  <SettingSection title="06 · LAYOUT" delay={0.46}>
    <SettingRow title="Rails" note="Auto lays them along the top and bottom on a screen turned to portrait." wide>
      <SegmentedControl options={LAYOUT_MODES.map((id) => ({ id, label: LAYOUT_LABELS[id] }))} value={layout.mode} onPick={(m) => (layout.mode = m)} />
    </SettingRow>
  </SettingSection>

  <SettingSection title="07 · DEVICE" delay={0.52}>
    <div class="scope device"><span class="tag">SCOPE</span><span class="where">This device only, not the workspace</span></div>
    <SettingRow title="Orb quality" note="Low draws half the strands, drops the wide glow and renders at 1x." wide>
      <SegmentedControl options={QUALITIES} value={orbQuality.value} onPick={setOrbQuality} />
    </SettingRow>
    <SettingRow title="Sound effects" note="Interface sounds.">
      <SwitchToggle on={sound.on} label="Sound effects" onToggle={() => setSound(!sound.on)} />
    </SettingRow>
  </SettingSection>
</div>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 22px;
    max-width: 680px;
    margin: 0 auto;
  }
  .scope {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid rgba(var(--nx-ac), 0.16);
    border-radius: 10px;
    background: rgba(var(--nx-mu), 0.06);
    animation: nx-sub 0.5s ease 0.1s both;
  }
  .scope.device {
    animation: none;
  }
  .tag {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.18em;
    color: rgba(var(--nx-ac), 0.6);
  }
  .where {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    color: rgb(var(--nx-fg));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .auto {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: rgb(var(--nx-ac));
  }
  .auto i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: rgb(var(--nx-ac));
    box-shadow: 0 0 6px rgb(var(--nx-ac));
    animation: nx-blink 2s ease-in-out infinite;
  }
  .title {
    font-size: 13px;
    font-weight: 500;
    color: rgb(var(--nx-fg));
  }
  .note {
    font-size: 11.5px;
    line-height: 1.45;
    color: rgba(var(--nx-ac), 0.7);
    text-wrap: pretty;
  }
  .text,
  .palettes-head {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .palettes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
  }
  .palette {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 8px;
    background: rgba(var(--nx-mu), 0.05);
    border: 1px solid rgba(var(--nx-ac), 0.16);
    border-radius: 11px;
    cursor: pointer;
    text-align: left;
    transition:
      border-color 0.3s,
      box-shadow 0.3s,
      transform 0.2s;
  }
  .palette:hover {
    transform: translateY(-1px);
  }
  .palette:active {
    transform: scale(0.98);
  }
  .palette.sel {
    border-color: rgba(var(--nx-ac), 0.75);
    box-shadow:
      0 0 0 1px rgba(var(--nx-ac), 0.25),
      0 0 26px rgba(var(--nx-ac), 0.14);
  }
  .preview {
    display: flex;
    height: 54px;
    border-radius: 7px;
    overflow: hidden;
    border: 1px solid rgba(var(--nx-hi), 0.08);
  }
  .half {
    position: relative;
    flex: 1;
  }
  .ring {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 18px;
    height: 18px;
    margin: -10px 0 0 -10px;
    border-radius: 50%;
    border: 1px solid;
  }
  .base {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 7px;
    height: 2px;
    opacity: 0.8;
  }
  .caption {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .plabel {
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgb(var(--nx-ac));
  }
  .sel .plabel {
    color: rgb(var(--nx-fg));
  }
  .pnote {
    font: 400 8.5px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: rgba(var(--nx-ac), 0.5);
  }
  .dock {
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(var(--nx-ac), 0.14);
    border-radius: 10px;
    overflow: hidden;
  }
  .drow {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) auto auto;
    gap: 12px;
    align-items: center;
    padding: 8px 10px 8px 12px;
    border-top: 1px solid rgba(var(--nx-ac), 0.08);
    transition: opacity 0.3s;
  }
  .drow:first-child {
    border-top-color: transparent;
  }
  .drow:hover {
    background: rgba(var(--nx-mu), 0.06);
  }
  .drow.off {
    opacity: 0.5;
  }
  .n {
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.08em;
    color: rgba(var(--nx-ac), 0.55);
  }
  .dname {
    font-size: 13px;
    font-weight: 500;
    color: rgb(var(--nx-fg));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .moves {
    display: flex;
    gap: 4px;
  }
  .moves button {
    width: 24px;
    height: 24px;
    padding: 0;
    background: none;
    border: 1px solid rgba(var(--nx-ac), 0.22);
    border-radius: 6px;
    color: rgb(var(--nx-ac));
    font-size: 10px;
    line-height: 1;
    cursor: pointer;
  }
  .moves button:hover {
    border-color: rgba(var(--nx-ac), 0.7);
    color: rgb(var(--nx-fg));
  }
  .slider {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .slider input {
    flex: 1;
    min-width: 0;
    accent-color: rgb(var(--nx-ac));
    cursor: pointer;
  }
  .slider span {
    width: 26px;
    text-align: right;
    font: 400 12px/1 var(--font-mono);
    color: rgb(var(--nx-fg));
  }
  .name {
    width: 100%;
    height: 32px;
    box-sizing: border-box;
    padding: 0 10px;
    background: rgba(var(--nx-bg), 0.5);
    border: 1px solid rgba(var(--nx-ac), 0.3);
    border-radius: 8px;
    color: rgb(var(--nx-fg));
    font: 400 13px var(--font-ui);
    outline: none;
  }
  .name:focus {
    border-color: rgba(var(--nx-ac), 0.75);
  }
  .name.bad {
    border-color: #ff6b8a;
  }
  .problem {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: #ff6b8a;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .actions button {
    height: 30px;
    padding: 0 12px;
    background: rgba(var(--nx-mu), 0.08);
    border: 1px solid rgba(var(--nx-ac), 0.35);
    border-radius: 8px;
    color: rgb(var(--nx-ac));
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.16em;
    cursor: pointer;
    transition:
      color 0.25s,
      border-color 0.25s,
      background 0.25s;
  }
  .actions button:hover:not(:disabled) {
    background: rgba(var(--nx-mu), 0.22);
    color: rgb(var(--nx-fg));
  }
  .actions .danger {
    margin-left: auto;
  }
  .actions .danger.armed {
    color: #ff6b8a;
    border-color: #ff6b8a;
  }
  .actions button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
