<script lang="ts">
  import { moduleContributions } from '../services/service-ui'

  // The Calendar module is a frame for whatever service contributes to it.
  const contributions = moduleContributions('calendar')
</script>

{#each contributions as c (c.windowId + c.serviceId + c.id)}
  {@const Body = c.component}
  <Body />
{:else}
  <div class="empty">NO CALENDAR REGISTERED</div>
{/each}

<style>
  .empty {
    padding: 24px 0;
    text-align: center;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.22em;
    color: rgba(var(--nx-ac), 0.5);
  }
</style>
