<script lang="ts">
  let { on, locked = false, label, onToggle }: { on: boolean; locked?: boolean; label: string; onToggle: () => void } = $props()
</script>

<button class="switch" class:on class:locked role="switch" aria-checked={on} aria-label={label} onclick={() => !locked && onToggle()}>
  <span class="knob"></span>
</button>

<style>
  .switch {
    position: relative;
    width: 32px;
    height: 18px;
    flex: none;
    padding: 0;
    border-radius: 999px;
    border: 1px solid rgba(var(--nx-ac), 0.25);
    background: rgba(var(--nx-mu), 0.1);
    cursor: pointer;
    transition:
      background 0.3s,
      border-color 0.3s;
  }
  .switch.on {
    background: rgba(var(--nx-ac), 0.22);
    border-color: rgba(var(--nx-ac), 0.7);
  }
  .switch.locked {
    cursor: not-allowed;
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: rgba(var(--nx-ac), 0.55);
    transition:
      transform 0.32s cubic-bezier(0.3, 1.5, 0.5, 1),
      background 0.3s,
      box-shadow 0.3s;
  }
  .on .knob {
    background: rgb(var(--nx-fg));
    box-shadow: 0 0 8px rgba(var(--nx-ac), 0.8);
    transform: translateX(14px);
  }
</style>
