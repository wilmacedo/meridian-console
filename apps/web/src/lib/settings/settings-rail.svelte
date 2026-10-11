<script lang="ts">
  import type { SectionView } from './settings-index'

  let { sections, searching, onPick }: { sections: SectionView[]; searching: boolean; onPick: (id: string) => void } = $props()
</script>

<nav class="rail" aria-label="Settings sections">
  {#each sections as s (s.id)}
    <button class:active={s.active} class:miss={searching && !s.count} aria-current={s.active && !searching ? 'true' : undefined} onclick={() => onPick(s.id)}>
      <span class="bar" class:on={s.active && !searching}></span>
      <span class="code">{s.code}</span>
      <span class="label">{s.label}</span>
      <span class="count" class:hit={searching && s.count > 0}>{searching && !s.count ? '–' : s.count}</span>
    </button>
  {/each}
</nav>

<style>
  .rail {
    display: flex;
    flex-direction: var(--rail-dir, column);
    flex-wrap: wrap;
    gap: 3px;
    min-width: 0;
  }
  button {
    position: relative;
    flex: none;
    height: 34px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px 0 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition:
      background 0.25s,
      border-color 0.25s,
      opacity 0.25s;
  }
  button:hover {
    background: rgba(var(--nx-mu), 0.12);
  }
  button.active {
    background: rgba(var(--nx-mu), 0.16);
  }
  button.active:has(.bar.on) {
    border-color: rgba(var(--nx-ac), 0.35);
  }
  button.miss {
    opacity: 0.4;
  }
  .bar {
    position: absolute;
    left: -1px;
    top: 50%;
    width: 2px;
    height: 0;
    margin-top: -7px;
    background: rgb(var(--nx-ac));
    box-shadow: 0 0 8px rgb(var(--nx-ac));
    transition: height 0.3s cubic-bezier(0.3, 1.4, 0.5, 1);
  }
  .bar.on {
    height: 14px;
  }
  .code {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.1em;
    color: rgba(var(--nx-ac), 0.5);
  }
  .label {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    color: rgb(var(--nx-ac));
    white-space: nowrap;
  }
  .active .label {
    color: rgb(var(--nx-fg));
  }
  .count {
    font: 400 9px/1 var(--font-mono);
    letter-spacing: 0.08em;
    color: rgba(var(--nx-ac), 0.45);
  }
  .count.hit {
    color: rgb(var(--nx-ac));
  }
</style>
