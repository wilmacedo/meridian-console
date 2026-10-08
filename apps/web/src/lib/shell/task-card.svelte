<script lang="ts">
  import { untrack } from 'svelte'
  import type { TaskView } from '@meridian/service-sdk'
  import { currentStep, formatElapsed, stepNumber } from '../agent/task-progress'
  import { clock } from '../clock.svelte'
  import { showDoc } from '../docs/docs.svelte'
  import { live, sendToServer } from '../live/stream.svelte'
  import { wm } from '../windows/window-manager.svelte'
  import { layout } from '../workspace/layout.svelte'
  import { carGeometry, isCar } from './car.svelte'

  // The task is gone from the server's list as soon as it ends, so the card keeps the last view of it
  // for a moment: COMPLETE, then it leaves.
  const COMPLETE_MS = 1000
  const LEAVE_MS = 460

  let shown = $state<{ task: TaskView; phase: 'run' | 'done' | 'out' } | null>(null)
  let minimized = $state(false)
  let timers: ReturnType<typeof setTimeout>[] = []

  const clearTimers = (): void => {
    timers.forEach(clearTimeout)
    timers = []
  }

  $effect(() => {
    const task = live.tasks.at(-1)
    untrack(() => {
      if (task) {
        if (shown?.task.id !== task.id) clearTimers()
        shown = { task, phase: 'run' }
      } else if (shown?.phase === 'run') {
        const last = shown.task
        shown = { task: { ...last, steps: last.steps.map((s) => ({ ...s, state: 'done' as const })) }, phase: 'done' }
        timers.push(
          setTimeout(() => {
            if (shown) shown = { ...shown, phase: 'out' }
            timers.push(setTimeout(() => (shown = null), LEAVE_MS))
          }, COMPLETE_MS),
        )
      }
    })
  })

  $effect(() => clearTimers)

  function stop(): void {
    if (!shown || shown.phase !== 'run') return
    sendToServer({ type: 'stop_tasks', id: shown.task.id })
    clearTimers()
    shown = { ...shown, phase: 'out' }
    timers.push(setTimeout(() => (shown = null), LEAVE_MS))
  }

  const home = $derived(wm.active === 'core')
  const car = $derived(isCar() ? carGeometry() : undefined)
  const tall = $derived(!car && home && layout.h >= 720)
  const compact = $derived(!tall || minimized)

  const steps = $derived(shown?.task.steps ?? [])
  const running = $derived(shown?.phase === 'run')
  const done = $derived(shown?.phase === 'done')
  const current = $derived(currentStep(steps))
  const total = $derived(String(steps.length).padStart(2, '0'))
  const step = $derived(String(stepNumber(steps)).padStart(2, '0'))
  const elapsed = $derived(shown ? formatElapsed(clock.now.getTime() - shown.task.startedAt) : '00:00')
</script>

{#if shown}
  {@const t = shown.task}
  <div
    class="place"
    class:tall
    style:width={car ? `${Math.min(460, car.zoneW - 32)}px` : `max(260px, min(${tall ? '500px' : '560px'}, calc(100% - 2 * min(300px, 24vw) - 120px)))`}
    style:left={car && `${car.zoneW / 2}px`}
    style:bottom={car && `${car.bar + 22}px`}
  >
    {#key t.id}
      <section class:compact class:out={shown.phase === 'out'} style:--gap={tall ? '11px' : '7px'} style:--pad={tall ? '14px 16px 10px' : '10px 14px 12px'}>
        <i class="glow"></i>
        {#if running}<i class="sweep"></i>{/if}
        {#if done}<i class="flash"></i>{/if}
        <div class="head">
          <span class="diamond"><i class:pulse={running}></i></span>
          <span class="kicker">NOX · {running ? 'WORKING' : 'COMPLETE'}</span>
          <span class="rule"></span>
          {#if steps.length}<span class="step">STEP {step}/{total}</span>{/if}
          <span class="elapsed">{elapsed}</span>
          <button title={minimized ? 'Expand' : 'Minimize'} onclick={() => (minimized = !minimized)}>{minimized ? '+' : '−'}</button>
          <button title="Stop" onclick={stop}>✕</button>
        </div>
        <div class="titleRow">
          <button class="title" style:font-size={tall ? '23px' : '17px'} onclick={() => void showDoc(`task-${t.id}`)}>{t.title}</button>
          {#if compact && current}
            {#key current.label}<span class="current">→ {current.label}</span>{/key}
          {/if}
        </div>
        {#if steps.length}
          <div class="body" class:min={minimized}>
            <div class="clip">
              <div class="inner" style:--gap={tall ? '11px' : '7px'}>
                <div class="segs">
                  {#each steps as s, i (i)}
                    <div class="seg">
                      <div class="fill" style:width={s.state === 'done' ? '100%' : '0'}></div>
                      {#if s.state === 'active' && running}<div class="hi"></div>{/if}
                    </div>
                  {/each}
                </div>
                {#if tall}
                  <div class="list">
                    {#each steps as s, i (i)}
                      <div class="row" style:animation-delay="{0.2 + i * 0.08}s">
                        <span class="mark">
                          {#if s.state === 'done'}<span class="check">✓</span>
                          {:else if s.state === 'active'}<span class="dot"><i></i><b></b></span>
                          {:else}<span class="box"></span>{/if}
                        </span>
                        <span class="label" class:active={s.state === 'active'} class:todo={s.state === 'todo'}>{s.label}</span>
                        <span class="result">{s.state === 'done' ? (s.result ?? '') : ''}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </section>
    {/key}
  </div>
{/if}

<style>
  .place {
    position: absolute;
    left: 50%;
    bottom: 100px;
    transform: translateX(-50%);
    z-index: 9;
    pointer-events: auto;
  }
  .place.tall {
    bottom: auto;
    top: min(calc(38% + 30vmin + 18px), calc(100% - 300px));
  }
  section {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    padding: var(--pad);
    background: linear-gradient(180deg, rgba(var(--nx-pn), 0.86), rgba(var(--nx-pn), 0.93));
    backdrop-filter: blur(18px) saturate(1.4);
    border: 1px solid rgba(var(--nx-hi), 0.14);
    border-radius: 14px;
    box-shadow:
      0 24px 60px rgba(var(--nx-sh), calc(0.5 * var(--nx-so))),
      inset 0 1px 0 rgba(var(--nx-hi), 0.06);
    animation:
      nx-in 0.62s cubic-bezier(0.2, 0.7, 0.2, 1) both,
      nx-edge 1.1s ease-out both;
  }
  section.out {
    animation: nx-close 0.46s cubic-bezier(0.6, 0, 0.3, 1) forwards;
  }
  .glow {
    position: absolute;
    left: 14%;
    right: 14%;
    top: 0;
    height: 1px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(var(--nx-ac), 0.95), transparent);
    box-shadow: 0 0 12px rgba(var(--nx-ac), 0.9);
  }
  .sweep {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 34%;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(var(--nx-ac), 0.08) 50%, transparent);
    animation: nx-sweep 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  .flash {
    position: absolute;
    inset: 0;
    border-radius: 14px;
    pointer-events: none;
    border: 1px solid rgb(var(--nx-ac));
    box-shadow: inset 0 0 26px rgba(var(--nx-ac), 0.25);
    animation: nx-flash 0.45s ease-in-out 2 both;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(var(--nx-ac), 0.7);
  }
  .diamond {
    position: relative;
    width: 6px;
    height: 6px;
    flex: none;
    border: 1px solid rgb(var(--nx-ac));
    transform: rotate(45deg);
  }
  .diamond i {
    position: absolute;
    inset: 1px;
    background: rgb(var(--nx-ac));
  }
  .diamond i.pulse {
    animation: nx-flash 1s ease-in-out infinite;
  }
  .kicker {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: rgb(var(--nx-ac));
  }
  .rule {
    flex: 1;
    min-width: 0;
    height: 1px;
    background: linear-gradient(90deg, rgba(var(--nx-ac), 0.3), transparent);
  }
  .step,
  .elapsed {
    flex: none;
    white-space: nowrap;
  }
  .elapsed {
    color: rgb(var(--nx-fg));
  }
  .head button {
    width: 22px;
    height: 22px;
    flex: none;
    padding: 0;
    background: none;
    border: 1px solid rgba(var(--nx-ac), 0.25);
    border-radius: 6px;
    color: rgb(var(--nx-ac));
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
  }
  .head button:hover {
    border-color: rgba(var(--nx-ac), 0.7);
    color: rgb(var(--nx-fg));
  }
  .titleRow {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
  }
  .title {
    flex: none;
    max-width: 100%;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: var(--font-serif);
    line-height: 1.05;
    color: rgb(var(--nx-fg));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .current {
    flex: 1;
    min-width: 0;
    font: 400 10px/1 var(--font-mono);
    letter-spacing: 0.1em;
    color: rgba(var(--nx-ac), 0.75);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    animation: nx-sub 0.4s ease both;
  }
  .body {
    display: grid;
    grid-template-rows: 1fr;
    transition:
      grid-template-rows 0.38s cubic-bezier(0.4, 0, 0.2, 1),
      margin-top 0.38s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .body.min {
    grid-template-rows: 0fr;
    margin-top: calc(-1 * var(--gap));
  }
  .clip {
    min-height: 0;
    overflow: hidden;
  }
  .inner {
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    transition:
      opacity 0.28s ease,
      transform 0.38s cubic-bezier(0.4, 0, 0.2, 1),
      filter 0.28s ease;
  }
  .min .inner {
    opacity: 0;
    transform: translateY(-8px);
    filter: blur(4px);
  }
  .segs {
    display: flex;
    gap: 4px;
    padding-top: 1px;
  }
  .seg {
    position: relative;
    flex: 1;
    height: 3px;
    border-radius: 2px;
    background: rgba(var(--nx-mu), 0.22);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: rgb(var(--nx-ac));
    box-shadow: 0 0 8px rgb(var(--nx-ac));
    border-radius: 2px;
    transition: width 0.4s ease;
  }
  .hi {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 40%;
    background: linear-gradient(90deg, transparent, rgba(var(--nx-fg), 0.7), transparent);
    animation: nx-sweep 1.1s linear infinite;
  }
  .list {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 5px 0;
    border-top: 1px solid rgba(var(--nx-ac), 0.07);
    animation: nx-sub 0.45s ease both;
  }
  .mark {
    width: 12px;
    height: 12px;
    display: grid;
    place-items: center;
  }
  .check {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: rgb(var(--nx-ac));
    display: grid;
    place-items: center;
    color: rgb(var(--nx-pn));
    font-size: 8px;
    line-height: 1;
    animation: nx-land 0.4s ease both;
  }
  .dot {
    position: relative;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgb(var(--nx-ac));
  }
  .dot i {
    position: absolute;
    inset: 2px;
    border-radius: 50%;
    background: rgb(var(--nx-ac));
    animation: nx-flash 1s ease-in-out infinite;
  }
  .dot b {
    position: absolute;
    inset: -1px;
    border-radius: 50%;
    border: 1px solid rgb(var(--nx-ac));
    animation: nx-ping 1.2s ease-out infinite;
  }
  .box {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    border: 1px dashed rgba(var(--nx-ac), 0.45);
    box-sizing: border-box;
  }
  .label {
    font-size: 13px;
    color: rgba(var(--nx-fg), 0.55);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 0.3s;
  }
  .label.active {
    color: rgb(var(--nx-fg));
  }
  .label.todo {
    color: rgba(var(--nx-ac), 0.55);
  }
  .result {
    font: 400 9.5px/1 var(--font-mono);
    letter-spacing: 0.08em;
    color: rgba(var(--nx-ac), 0.7);
  }
</style>
