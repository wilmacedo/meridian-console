<script lang="ts">
  import type { Workspace } from '@meridian/service-sdk'
  import { PALETTES, type PaletteId } from '../theme/palettes'
  import { isLight } from '../theme/theme.svelte'
  import { NAME_MAX, nameProblem } from '../workspace/workspace-name'
  import { workspaceCard, workspaceCode } from '../workspace/workspace-card'
  import { createWorkspace, currentIndex, currentWorkspace, refreshWorkspaces, renameWorkspace, snapshot, switchWorkspace, workspaceId, workspaces } from '../workspace/workspace-sync.svelte'
  import { open as openWindow } from '../windows/window-manager.svelte'
  import { shellUi } from './shell-ui.svelte'

  const open = $derived(shellUi.workspacesOpen)
  const list = $derived(workspaces.list)
  const current = $derived(currentWorkspace())
  const code = $derived(workspaceCode(currentIndex()))

  let adding = $state(false)
  let draft = $state('')
  let renaming = $state<string | null>(null)
  let renameDraft = $state('')
  // What the server said when it refused a name; cleared as soon as the name changes.
  let refused = $state<string | undefined>()

  // The list is read each time the panel opens, so a workspace made on another screen shows up.
  $effect(() => {
    if (open) void refreshWorkspaces()
    else {
      adding = false
      draft = ''
      renaming = null
      refused = undefined
    }
  })

  const accent = (palette: string): string => {
    const p = PALETTES[(palette in PALETTES ? palette : 'meridian') as PaletteId]
    return `rgb(${(isLight() && p.light ? p.light : p.dark).ac})`
  }

  const bars = (n: number): number[] => Array.from({ length: n }, (_, i) => i)
  const problem = $derived(refused ?? (draft.trim() ? nameProblem(draft, list) : undefined))
  const focus = (node: HTMLInputElement): void => {
    node.focus()
    node.select()
  }

  async function create(): Promise<void> {
    const issue = nameProblem(draft, list)
    if (issue) return void (refused = issue)
    refused = await createWorkspace(draft)
    if (!refused) shellUi.workspacesOpen = false
  }

  async function commitRename(w: Workspace): Promise<void> {
    const name = renameDraft.trim()
    renaming = null
    if (name && name !== w.name) await renameWorkspace(w.id, name)
  }

  function pick(w: Workspace): void {
    if (renaming) return
    shellUi.workspacesOpen = false
    void switchWorkspace(w.id)
  }
</script>

{#if open}<div class="catch" role="presentation" onclick={() => (shellUi.workspacesOpen = false)}></div>{/if}

<div class="place">
  <button class="chip" class:open title="Workspaces (W)" onclick={() => (shellUi.workspacesOpen = !open)}>
    <span class="diamond"></span>
    <span class="code">WS·{code}</span>
    {#key current?.id}<span class="name">{current?.name ?? ''}</span>{/key}
    <span class="count">{currentIndex() + 1}/{Math.max(1, list.length)}</span>
    <span class="chev" style:transform="rotate({open ? 180 : 0}deg)">▾</span>
  </button>

  {#if open}
    <div class="panel">
      <i class="sweep"></i>
      <i class="topline"></i>
      <div class="title"><span>WORKSPACES</span><span class="rule"></span><span>⌥1–9</span></div>
      <div class="rows">
        {#each list as w, i (w.id)}
          {@const active = w.id === workspaceId()}
          {@const card = workspaceCard(active ? { state: snapshot() } : w)}
          {@const swatch = accent(card.palette)}
          <div class="row" class:active role="button" tabindex="0" style:animation-delay="{0.06 + i * 0.05}s" onclick={() => pick(w)} onkeydown={(e) => e.key === 'Enter' && pick(w)}>
            <div class="thumb">
              <div class="rail">{#each bars(card.left) as b (b)}<span style:background={swatch}></span>{/each}</div>
              <div class="wins">{#each bars(card.windows) as b (b)}<span style:border-color={swatch}></span>{/each}</div>
              <div class="rail">{#each bars(card.right) as b (b)}<span style:background={swatch}></span>{/each}</div>
              {#if card.windows === 0}<i class="empty" style:border-color={swatch} style:box-shadow="0 0 6px {swatch}"></i>{/if}
            </div>
            <div class="info">
              {#if renaming === w.id}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  use:focus
                  bind:value={renameDraft}
                  maxlength={NAME_MAX}
                  onclick={(e) => e.stopPropagation()}
                  onkeydown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') void commitRename(w)
                    else if (e.key === 'Escape') renaming = null
                  }}
                  onblur={() => renaming === w.id && void commitRename(w)}
                />
              {:else}
                <span class="label" ondblclick={(e) => ((e.stopPropagation(), (renaming = w.id), (renameDraft = w.name)))} role="presentation">{w.name}</span>
              {/if}
              <span class="meta">{card.meta}</span>
            </div>
            <span class="tag">{active ? 'ACTIVE' : `⌥${i + 1}`}</span>
          </div>
        {/each}
      </div>
      <div class="foot">
        {#if adding}
          <form
            onsubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <input use:focus bind:value={draft} oninput={() => (refused = undefined)} maxlength={NAME_MAX} placeholder="Name this workspace" spellcheck="false" autocomplete="off" aria-invalid={problem !== undefined} onkeydown={(e) => e.key === 'Escape' && ((e.stopPropagation(), (adding = false)))} />
            <button type="submit" class="create" disabled={!draft.trim() || problem !== undefined}>CREATE</button>
            <button type="button" class="cancel" onclick={() => (adding = false)}>✕</button>
          </form>
          {#if problem}<span class="problem">{problem}</span>{/if}
        {:else}
          <button class="add" onclick={() => (adding = true)}><span>+</span>NEW WORKSPACE</button>
        {/if}
        <div class="hints">
          <span>DOUBLE-CLICK TO RENAME</span>
          <button onclick={() => ((shellUi.workspacesOpen = false), openWindow('settings'))}>, SETTINGS</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .catch {
    position: absolute;
    inset: 0;
    z-index: 39;
  }
  .place {
    position: absolute;
    top: 12px;
    left: 20px;
    z-index: 40;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .chip {
    height: 30px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 11px;
    background: rgba(var(--nx-pn), 0.55);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(var(--nx-ac), 0.25);
    border-radius: 8px;
    color: rgb(var(--nx-ac));
    cursor: pointer;
    transition:
      border-color 0.25s,
      background 0.25s;
  }
  .chip:hover,
  .chip.open {
    border-color: rgba(var(--nx-ac), 0.65);
    background: rgba(var(--nx-pn), 0.8);
  }
  .diamond {
    width: 5px;
    height: 5px;
    flex: none;
    border: 1px solid rgba(var(--nx-ac), 0.8);
    transform: rotate(45deg);
  }
  .code {
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.18em;
    color: rgba(var(--nx-ac), 0.6);
  }
  .name {
    font-size: 12.5px;
    font-weight: 500;
    color: rgb(var(--nx-fg));
    max-width: 180px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    animation: nx-sub 0.45s ease both;
  }
  .count {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.1em;
    color: rgba(var(--nx-ac), 0.5);
  }
  .chev {
    display: block;
    font-size: 9px;
    line-height: 1;
    color: rgba(var(--nx-ac), 0.7);
    transition: transform 0.3s cubic-bezier(0.3, 1.4, 0.5, 1);
  }
  .panel {
    position: relative;
    width: 330px;
    max-width: calc(100vw - 40px);
    overflow: hidden;
    background: linear-gradient(180deg, rgba(var(--nx-pn), 0.9), rgba(var(--nx-pn), 0.95));
    backdrop-filter: blur(18px) saturate(1.4);
    border: 1px solid rgba(var(--nx-hi), 0.14);
    border-radius: 14px;
    box-shadow:
      0 30px 80px rgba(var(--nx-sh), 0.55),
      inset 0 1px 0 rgba(var(--nx-hi), 0.08);
    animation: nx-in 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    transform-origin: top left;
  }
  .sweep {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 38%;
    pointer-events: none;
    z-index: 3;
    background: linear-gradient(90deg, transparent, rgba(var(--nx-ac), 0.14) 45%, rgba(var(--nx-ac), 0.24) 50%, rgba(var(--nx-ac), 0.14) 55%, transparent);
    animation: nx-sweep 0.9s cubic-bezier(0.3, 0.6, 0.3, 1) 0.1s both;
  }
  .topline {
    position: absolute;
    left: 16%;
    right: 16%;
    top: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(var(--nx-ac), 0.9), transparent);
    box-shadow: 0 0 10px rgba(var(--nx-ac), 0.8);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 13px 14px 10px;
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(var(--nx-ac), 0.6);
  }
  .rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(var(--nx-ac), 0.25), transparent);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 8px 8px;
    max-height: 360px;
    overflow-y: auto;
  }
  .row {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 8px;
    border-radius: 10px;
    border: 1px solid transparent;
    cursor: pointer;
    transition:
      background 0.2s,
      border-color 0.2s;
    animation: nx-sub 0.45s ease both;
  }
  .row:hover {
    border-color: rgba(var(--nx-ac), 0.3);
  }
  .row.active {
    background: rgba(var(--nx-mu), 0.14);
    border-color: rgba(var(--nx-ac), 0.4);
  }
  .thumb {
    position: relative;
    width: 58px;
    height: 38px;
    box-sizing: border-box;
    border: 1px solid rgba(var(--nx-ac), 0.28);
    border-radius: 6px;
    padding: 4px;
    display: grid;
    grid-template-columns: 9px minmax(0, 1fr) 9px;
    gap: 4px;
    background: rgba(var(--nx-bg), 0.6);
  }
  .rail {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rail span {
    height: 6px;
    border-radius: 1px;
    opacity: 0.85;
  }
  .wins {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px;
    align-content: center;
  }
  .wins span {
    height: 10px;
    border: 1px solid;
    border-radius: 1.5px;
    opacity: 0.75;
  }
  .empty {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 9px;
    height: 9px;
    margin: -5.5px 0 0 -5.5px;
    border-radius: 50%;
    border: 1px solid;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .label {
    font-size: 13.5px;
    font-weight: 500;
    color: rgb(var(--nx-ac));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .active .label {
    color: rgb(var(--nx-fg));
  }
  .meta {
    font: 400 8.5px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: rgba(var(--nx-ac), 0.55);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tag {
    font: 400 8.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(var(--nx-ac), 0.18);
    color: rgba(var(--nx-ac), 0.55);
  }
  .active .tag {
    border-color: rgba(var(--nx-ac), 0.6);
    color: rgb(var(--nx-fg));
  }
  input {
    width: 100%;
    box-sizing: border-box;
    height: 22px;
    padding: 0 6px;
    background: rgba(var(--nx-bg), 0.6);
    border: 1px solid rgba(var(--nx-ac), 0.6);
    border-radius: 5px;
    color: rgb(var(--nx-fg));
    font: 400 13px var(--font-ui);
    outline: none;
  }
  .foot {
    border-top: 1px solid rgba(var(--nx-ac), 0.14);
    padding: 8px;
  }
  form {
    display: flex;
    gap: 6px;
    align-items: center;
    animation: nx-sub 0.3s ease both;
  }
  form input {
    flex: 1;
    min-width: 0;
    height: 32px;
    padding: 0 10px;
    border-color: rgba(var(--nx-ac), 0.5);
    border-radius: 8px;
  }
  form input[aria-invalid='true'] {
    border-color: #ff6b8a;
  }
  .create,
  .cancel,
  .add {
    background: none;
    cursor: pointer;
    border-radius: 8px;
    color: rgb(var(--nx-ac));
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.16em;
  }
  .create {
    height: 32px;
    padding: 0 12px;
    background: rgba(var(--nx-mu), 0.08);
    border: 1px solid rgba(var(--nx-ac), 0.6);
    color: rgb(var(--nx-fg));
  }
  .create:hover:not(:disabled) {
    background: rgba(var(--nx-mu), 0.22);
  }
  .create:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .cancel {
    width: 32px;
    height: 32px;
    flex: none;
    padding: 0;
    border: 1px solid rgba(var(--nx-ac), 0.25);
    font-size: 11px;
  }
  .cancel:hover,
  .add:hover {
    color: rgb(var(--nx-fg));
    border-color: rgba(var(--nx-ac), 0.6);
  }
  .problem {
    display: block;
    padding: 6px 2px 0;
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: #ff6b8a;
  }
  .add {
    width: 100%;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    border: 1px dashed rgba(var(--nx-ac), 0.3);
    font-size: 9.5px;
    letter-spacing: 0.2em;
    transition:
      border-color 0.2s,
      color 0.2s;
  }
  .add:hover {
    border-color: rgba(var(--nx-ac), 0.7);
  }
  .add span {
    font-size: 13px;
    line-height: 1;
  }
  .hints {
    display: flex;
    justify-content: space-between;
    padding: 8px 4px 0;
    font: 400 8.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: rgba(var(--nx-ac), 0.4);
  }
  .hints button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font: inherit;
    letter-spacing: inherit;
    color: inherit;
  }
  .hints button:hover {
    color: rgb(var(--nx-fg));
  }
</style>
