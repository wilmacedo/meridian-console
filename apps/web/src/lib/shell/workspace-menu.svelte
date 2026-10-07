<script lang="ts">
  import type { WorkspaceSummary } from '@meridian/service-sdk'
  import { createWorkspace, listWorkspaces, switchWorkspace, workspaceId } from '../workspace/workspace-sync.svelte'
  import { NAME_MAX, nameProblem } from '../workspace/workspace-name'

  let { open = $bindable(false) }: { open: boolean } = $props()

  let workspaces = $state<WorkspaceSummary[]>([])
  let creating = $state(false)
  let name = $state('')
  // What the server said when it refused the name; cleared as soon as the name changes.
  let refused = $state<string | undefined>()
  let busy = $state(false)

  // The list is read each time the menu opens, so a workspace made on another screen shows up.
  $effect(() => {
    if (open) void listWorkspaces().then((list) => (workspaces = list))
    else {
      creating = false
      name = ''
      refused = undefined
    }
  })

  const problem = $derived(refused ?? (name.trim() ? nameProblem(name, workspaces) : undefined))

  async function submit(): Promise<void> {
    const issue = nameProblem(name, workspaces)
    if (issue) return void (refused = issue)
    busy = true
    refused = await createWorkspace(name)
    busy = false
  }

  const focus = (node: HTMLInputElement): void => node.focus()
</script>

<svelte:window onpointerdown={(e) => open && !(e.target as Element).closest('.workspaces') && (open = false)} />

<div class="workspaces">
  <button class="trigger" class:open aria-label="Workspaces" aria-expanded={open} onclick={() => (open = !open)}>
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  </button>
  {#if open}
    <div class="menu" role="menu">
      <div class="group">
        <span class="title">WORKSPACES</span>
        {#each workspaces as w (w.id)}
          <button role="menuitemradio" aria-checked={w.id === workspaceId()} class:on={w.id === workspaceId()} onclick={() => w.id !== workspaceId() && void switchWorkspace(w.id)}>
            <i class="dot"></i>{w.name}
          </button>
        {/each}
      </div>
      <div class="group">
        {#if creating}
          <form onsubmit={(e) => (e.preventDefault(), void submit())}>
            <input use:focus bind:value={name} oninput={() => (refused = undefined)} maxlength={NAME_MAX} placeholder="Workspace name" spellcheck="false" autocomplete="off" aria-invalid={problem !== undefined} />
            <div class="row">
              <span class="problem">{problem ?? ''}</span>
              <button type="submit" disabled={busy || !name.trim() || problem !== undefined}>CREATE</button>
            </div>
          </form>
        {:else}
          <button role="menuitem" onclick={() => (creating = true)}>
            <i class="dot plus"></i>New workspace
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .workspaces {
    position: absolute;
    top: 12px;
    right: 54px;
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
    width: 210px;
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
  .title {
    padding: 0 6px 4px;
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(var(--nx-ac), 0.55);
  }
  .group > button {
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
  .group > button:hover {
    background: rgba(var(--nx-mu), 0.14);
    color: rgb(var(--nx-fg));
  }
  .group > button.on {
    color: rgb(var(--nx-fg));
  }
  .dot {
    width: 5px;
    height: 5px;
    border: 1px solid rgba(var(--nx-ac), 0.7);
    transform: rotate(45deg);
  }
  .dot.plus {
    width: auto;
    height: auto;
    border: none;
    transform: none;
    font-size: 12px;
    line-height: 5px;
  }
  .dot.plus::before {
    content: '+';
  }
  .on .dot {
    background: rgb(var(--nx-ac));
    box-shadow: 0 0 6px rgb(var(--nx-ac));
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 8px;
    background: rgba(var(--nx-mu), 0.08);
    border: 1px solid rgba(var(--nx-ac), 0.35);
    border-radius: 6px;
    outline: none;
    font: 400 10.5px/1 var(--font-mono);
    letter-spacing: 0.06em;
    color: rgb(var(--nx-fg));
  }
  input:focus {
    border-color: rgba(var(--nx-ac), 0.8);
  }
  input[aria-invalid='true'] {
    border-color: #ff6b8a;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .problem {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: #ff6b8a;
  }
  .row button {
    padding: 5px 9px;
    background: rgba(var(--nx-mu), 0.14);
    border: 1px solid rgba(var(--nx-ac), 0.4);
    border-radius: 6px;
    cursor: pointer;
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgb(var(--nx-ac));
  }
  .row button:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
