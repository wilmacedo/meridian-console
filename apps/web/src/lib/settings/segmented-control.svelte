<script lang="ts" generics="T extends string">
  let { options, value, disabled = false, onPick }: { options: { id: T; label: string }[]; value: T; disabled?: boolean; onPick: (id: T) => void } = $props()

  const at = $derived(Math.max(0, options.findIndex((o) => o.id === value)))
</script>

<div class="seg" class:disabled style:--n={options.length}>
  <span class="thumb" style:left="calc(3px + (100% - 6px) / {options.length} * {at})"></span>
  {#each options as o (o.id)}
    <button class:on={o.id === value} {disabled} onclick={() => onPick(o.id)}>{o.label}</button>
  {/each}
</div>

<style>
  .seg {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    height: 32px;
    padding: 3px;
    box-sizing: border-box;
    border: 1px solid rgba(var(--nx-ac), 0.25);
    border-radius: 9px;
    background: rgba(var(--nx-bg), 0.4);
  }
  .seg.disabled {
    opacity: 0.45;
  }
  .thumb {
    position: absolute;
    top: 3px;
    bottom: 3px;
    width: calc((100% - 6px) / var(--n));
    border-radius: 6px;
    background: rgba(var(--nx-mu), 0.22);
    border: 1px solid rgba(var(--nx-ac), 0.55);
    box-sizing: border-box;
    box-shadow: 0 0 14px rgba(var(--nx-ac), 0.18);
    transition: left 0.38s cubic-bezier(0.3, 1.3, 0.5, 1);
  }
  button {
    position: relative;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgba(var(--nx-ac), 0.6);
    transition: color 0.3s;
  }
  button:disabled {
    cursor: not-allowed;
  }
  button.on {
    color: rgb(var(--nx-fg));
  }
</style>
