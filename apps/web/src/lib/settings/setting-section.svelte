<script lang="ts">
  import type { Snippet } from 'svelte'

  let { title, delay = 0, children }: { title: string; delay?: number; children: Snippet } = $props()
</script>

<section style:animation-delay="{delay}s">
  <header>
    <i></i>
    <span>{title}</span>
    <b></b>
  </header>
  {@render children()}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    animation: nx-sub 0.5s ease both;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  i {
    width: 5px;
    height: 5px;
    flex: none;
    border: 1px solid rgba(var(--nx-ac), 0.8);
    transform: rotate(45deg);
  }
  span {
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgb(var(--nx-ac));
  }
  b {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(var(--nx-ac), 0.3), transparent);
  }
</style>
