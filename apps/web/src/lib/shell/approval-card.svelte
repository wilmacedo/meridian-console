<script lang="ts">
  import { answerApproval, approvals } from '../agent/approval.svelte'

  const current = $derived(approvals.pending[0])
</script>

{#if current}
  {#key current.id}
    <div class="card" role="alertdialog" aria-label="NOX asks for confirmation">
      <span class="kicker">NOX PEDE CONFIRMAÇÃO{approvals.pending.length > 1 ? ` · +${approvals.pending.length - 1}` : ''}</span>
      <code class="detail">{current.detail}</code>
      <div class="actions">
        <button class="no" onclick={() => answerApproval(false)}>NEGAR</button>
        <button class="yes" onclick={() => answerApproval(true)}>CONFIRMAR</button>
      </div>
      <span class="hint">OU DIGA “CONFIRMA” · ESC NEGA</span>
    </div>
  {/key}
{/if}

<style>
  .card {
    position: fixed;
    left: 0;
    right: 0;
    margin: 0 auto;
    bottom: 110px;
    z-index: 30;
    width: min(460px, 90vw);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px;
    background: linear-gradient(180deg, rgba(var(--nx-pn), 0.94), rgba(var(--nx-pn), 0.97));
    backdrop-filter: blur(16px);
    border: 1px solid rgba(var(--nx-ac), 0.6);
    border-radius: 12px;
    box-shadow:
      0 28px 70px rgba(var(--nx-sh), 0.6),
      0 0 30px rgba(var(--nx-ac), 0.2);
    animation: nx-lift 0.35s var(--ease-out) both;
  }
  .kicker,
  .hint {
    font: 400 9px/1.2 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgba(var(--nx-ac), 0.65);
  }
  .hint {
    align-self: center;
    color: rgba(var(--nx-ac), 0.5);
  }
  .detail {
    max-height: 120px;
    overflow: auto;
    padding: 10px 12px;
    background: rgba(var(--nx-mu), 0.12);
    border-radius: 8px;
    font: 400 12px/1.5 var(--font-mono);
    color: rgb(var(--nx-fg));
    white-space: pre-wrap;
    word-break: break-all;
  }
  .actions {
    display: flex;
    gap: 10px;
  }
  button {
    flex: 1;
    padding: 10px 0;
    background: rgba(var(--nx-pn), 0.8);
    border: 1px solid rgba(var(--nx-ac), 0.35);
    border-radius: 8px;
    color: rgb(var(--nx-ac));
    font: 400 11px/1 var(--font-mono);
    letter-spacing: 0.18em;
    cursor: pointer;
  }
  button:hover {
    border-color: rgb(var(--nx-ac));
    color: rgb(var(--nx-fg));
  }
  .yes {
    background: rgba(var(--nx-ac), 0.16);
    border-color: rgb(var(--nx-ac));
    color: rgb(var(--nx-fg));
  }
</style>
