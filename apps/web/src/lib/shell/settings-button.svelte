<script lang="ts">
  import { close, isOpen, open } from '../windows/window-manager.svelte'
  import { shellUi } from './shell-ui.svelte'

  const opened = $derived(isOpen('settings'))

  function toggle(): void {
    shellUi.workspacesOpen = false
    if (opened) close('settings')
    else open('settings')
  }
</script>

<div class="place">
  <button class:opened title="Settings ( , )" onclick={toggle}>
    <span class="glyph">
      <span class="line"><i style:left={opened ? '9px' : '1px'}></i></span>
      <span class="line"><i style:left={opened ? '1px' : '7px'} style:transition-delay="0.05s"></i></span>
      <span class="line"><i style:left={opened ? '6px' : '3px'} style:transition-delay="0.1s"></i></span>
    </span>
    <span class="label">SETTINGS</span>
  </button>
</div>

<style>
  .place {
    position: absolute;
    top: 12px;
    right: 20px;
    z-index: 40;
  }
  button {
    height: 30px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px 0 11px;
    background: rgba(var(--nx-pn), 0.55);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(var(--nx-ac), 0.25);
    border-radius: 8px;
    color: rgb(var(--nx-ac));
    cursor: pointer;
    transition:
      border-color 0.25s,
      color 0.25s,
      background 0.25s;
  }
  button:hover,
  button.opened {
    border-color: rgba(var(--nx-ac), 0.65);
    color: rgb(var(--nx-fg));
    background: rgba(var(--nx-pn), 0.8);
  }
  .glyph {
    position: relative;
    width: 13px;
    height: 10px;
    flex: none;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .line {
    position: relative;
    height: 1px;
    background: currentColor;
    opacity: 0.7;
  }
  .line i {
    position: absolute;
    top: -2px;
    width: 3px;
    height: 3px;
    border: 1px solid currentColor;
    background: rgb(var(--nx-pn));
    transition: left 0.4s cubic-bezier(0.3, 1.4, 0.5, 1);
  }
  .label {
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.18em;
  }
</style>
