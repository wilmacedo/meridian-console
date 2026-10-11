<script lang="ts">
  let { value = $bindable('') }: { value: string } = $props()
  let input: HTMLInputElement

  function onkeydown(e: KeyboardEvent): void {
    e.stopPropagation()
    if (e.key !== 'Escape') return
    if (value) value = ''
    else input.blur()
  }
</script>

<div class="search" class:filled={value}>
  <i class="glass"></i>
  <input bind:this={input} bind:value {onkeydown} data-settings-search placeholder="Search settings" aria-label="Search settings" spellcheck="false" />
  {#if value}
    <button aria-label="Clear search" onclick={() => ((value = ''), input.focus())}>✕</button>
  {:else}
    <kbd>/</kbd>
  {/if}
</div>

<style>
  .search {
    position: relative;
    display: flex;
    align-items: center;
    height: 34px;
    border: 1px solid rgba(var(--nx-ac), 0.25);
    border-radius: 9px;
    background: rgba(var(--nx-bg), 0.5);
    transition: border-color 0.25s;
  }
  .search.filled,
  .search:focus-within {
    border-color: rgba(var(--nx-ac), 0.65);
  }
  .glass {
    position: absolute;
    left: 11px;
    top: 11px;
    width: 8px;
    height: 8px;
    border: 1px solid rgba(var(--nx-ac), 0.7);
    border-radius: 50%;
  }
  .glass::after {
    content: '';
    position: absolute;
    left: 7px;
    top: 9px;
    width: 4px;
    height: 1px;
    background: rgba(var(--nx-ac), 0.7);
    transform: rotate(45deg);
    transform-origin: left center;
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    box-sizing: border-box;
    padding: 0 30px;
    background: none;
    border: none;
    outline: none;
    color: rgb(var(--nx-fg));
    font: 400 12.5px var(--font-ui);
  }
  button {
    position: absolute;
    right: 5px;
    top: 5px;
    width: 22px;
    height: 22px;
    padding: 0;
    background: rgba(var(--nx-mu), 0.12);
    border: none;
    border-radius: 6px;
    color: rgb(var(--nx-ac));
    font-size: 10px;
    cursor: pointer;
  }
  button:hover {
    color: rgb(var(--nx-fg));
  }
  kbd {
    position: absolute;
    right: 7px;
    top: 7px;
    height: 18px;
    min-width: 18px;
    box-sizing: border-box;
    padding: 0 5px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(var(--nx-ac), 0.25);
    border-radius: 5px;
    font: 400 9.5px/1 var(--font-mono);
    color: rgba(var(--nx-ac), 0.6);
    pointer-events: none;
  }
</style>
