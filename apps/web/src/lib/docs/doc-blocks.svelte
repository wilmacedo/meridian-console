<script lang="ts">
  import { toneColor, type DocBlock } from './doc-blocks'

  // `compact` is the dock-widget scale; the default is the document window's.
  let { blocks, compact = false }: { blocks: DocBlock[]; compact?: boolean } = $props()

  const clampPct = (v: number): number => Math.max(0, Math.min(100, v))
</script>

<div class="doc" class:compact>
  {#each blocks as b, i (i)}
    <div class="block">
      {#if b.t === 'h' && (b.level ?? 1) === 1}
        <div class="h1">
          {#if b.eyebrow}<span class="eyebrow">{b.eyebrow}</span>{/if}
          <span class="h1-text">{b.text}</span>
        </div>
      {:else if b.t === 'h'}
        <div class="h2"><i></i><span>{b.text}</span><b></b></div>
      {:else if b.t === 'p'}
        <div class="p">{b.text}</div>
      {:else if b.t === 'stats'}
        <div class="stats">
          {#each b.items as st}
            <div class="stat">
              <span class="stat-label">{st.label}</span>
              <span class="stat-value">{st.value}{#if st.unit}<span class="unit">{st.unit}</span>{/if}</span>
              {#if st.note}<span class="note" style:color={toneColor(st.tone, 'dim')}>{st.note}</span>{/if}
            </div>
          {/each}
        </div>
      {:else if b.t === 'progress'}
        <div class="progress">
          {#each b.items as pr}
            {@const v = clampPct(pr.value)}
            {@const color = toneColor(pr.tone, 'accent')}
            <div class="pr">
              <div class="pr-head"><span>{pr.label}</span><span class="pct">{Math.round(v)}%</span></div>
              <div class="track"><div class="fill" style:width="{v}%" style:background={color} style:box-shadow="0 0 10px {color}"></div></div>
              {#if pr.detail}<span class="detail">{pr.detail}</span>{/if}
            </div>
          {/each}
        </div>
      {:else if b.t === 'table'}
        {@const cols = b.cols.map((c) => c.w ?? 'minmax(0,1fr)').join(' ')}
        <div class="table">
          <div class="trow thead" style:grid-template-columns={cols}>
            {#each b.cols as c}<span style:text-align={c.align ?? 'left'}>{c.label}</span>{/each}
          </div>
          {#each b.rows as row}
            <div class="trow" style:grid-template-columns={cols}>
              {#each row as cell, ci}
                {@const c = typeof cell === 'object' ? cell : { v: cell, tone: undefined }}
                <span style:text-align={b.cols[ci]?.align ?? 'left'} style:color={toneColor(c.tone, ci === 0 ? 'fg' : 'dim')}>{c.v}</span>
              {/each}
            </div>
          {/each}
        </div>
      {:else if b.t === 'list'}
        <div class="list">
          {#each b.items as li}
            {@const state = li.state ?? 'todo'}
            <div class="li">
              <span class="mark">
                {#if state === 'done'}<span class="done">✓</span>
                {:else if state === 'active'}<span class="active"><i></i></span>
                {:else}<span class="todo"></span>{/if}
              </span>
              <span class="li-text" class:dim={state === 'done'} class:on={state === 'active'}>{li.text}</span>
              <span class="meta">{li.meta ?? ''}</span>
            </div>
          {/each}
        </div>
      {:else if b.t === 'callout'}
        {@const color = toneColor(b.tone, 'accent')}
        <div class="callout" style:border-color={color}>
          <span class="diamond" style:background={color} style:box-shadow="0 0 8px {color}"></span>
          <div class="callout-body">
            <span class="callout-title" style:color>{b.title ?? ''}</span>
            <span class="callout-text">{b.text}</span>
          </div>
        </div>
      {:else if b.t === 'kv'}
        <div class="kv">
          {#each b.items as r}
            <div class="kv-row"><span class="k">{r.k}</span><span style:color={toneColor(r.tone, 'fg')}>{r.v}</span></div>
          {/each}
        </div>
      {:else if b.t === 'code'}
        <div class="code">
          <div class="lang">{b.lang ?? 'TEXT'}</div>
          <pre>{b.text}</pre>
        </div>
      {:else if b.t === 'tags'}
        <div class="tags">
          {#each b.items as tg}
            {@const color = toneColor(tg.tone, 'dim')}
            <span class="tag" style:color style:border-color={color}>{tg.label}</span>
          {/each}
        </div>
      {:else if b.t === 'divider'}
        <div class="divider"></div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .doc {
    --gap: 18px;
    --h1: 30px;
    --h1-top: 6px;
    --h2: 10.5px;
    --h2-top: 9px;
    --p: 14.5px;
    --stat-min: 150px;
    --stat-gap: 10px;
    --stat-pad: 14px;
    --stat-value: 30px;
    --stat-unit: 12.5px;
    --pr-label: 11.5px;
    --track: 6px;
    --t-font: 11.5px;
    --t-pad: 14px;
    --li: 13.5px;
    --co-pad: 14px;
    --co-text: 13.5px;
    --kv: 11.5px;
    --code-pad: 14px;
    --code: 11.5px;
    display: flex;
    flex-direction: column;
    gap: var(--gap);
  }
  .doc.compact {
    --gap: 10px;
    --h1: 20px;
    --h1-top: 3.33px;
    --h2: 9px;
    --h2-top: 5px;
    --p: 12.5px;
    --stat-min: 100px;
    --stat-gap: 6px;
    --stat-pad: 9px;
    --stat-value: 18px;
    --stat-unit: 10.5px;
    --pr-label: 9.5px;
    --track: 4px;
    --t-font: 9.5px;
    --t-pad: 9px;
    --li: 11.5px;
    --co-pad: 9px;
    --co-text: 11.5px;
    --kv: 9.5px;
    --code-pad: 9px;
    --code: 9.5px;
  }
  .block {
    min-width: 0;
    animation: nx-sub 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }

  .h1 {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: var(--h1-top);
  }
  .eyebrow {
    font: 400 9.5px/1.2 var(--font-mono);
    letter-spacing: 0.2em;
    color: rgba(var(--nx-ac), 0.6);
  }
  .h1-text {
    font: 400 var(--h1) / 1.05 var(--font-serif);
    color: rgb(var(--nx-fg));
    text-wrap: balance;
  }
  .h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-top: var(--h2-top);
  }
  .h2 i {
    width: 5px;
    height: 5px;
    flex: none;
    border: 1px solid rgb(var(--nx-ac));
    transform: rotate(45deg);
  }
  .h2 span {
    font: 400 var(--h2) / 1.2 var(--font-mono);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgb(var(--nx-ac));
  }
  .h2 b {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(var(--nx-ac), 0.3), transparent);
  }
  .p {
    font-size: var(--p);
    line-height: 1.6;
    color: rgb(var(--nx-fg));
    opacity: 0.88;
    text-wrap: pretty;
    max-width: 68ch;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(var(--stat-min), 1fr));
    gap: var(--stat-gap);
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: var(--stat-pad);
    border: 1px solid rgba(var(--nx-ac), 0.14);
    border-radius: 10px;
    background: rgba(var(--nx-mu), 0.06);
  }
  .stat-label {
    font: 400 9px/1.2 var(--font-mono);
    letter-spacing: 0.16em;
    color: rgba(var(--nx-ac), 0.7);
  }
  .stat-value {
    font-size: var(--stat-value);
    font-weight: 500;
    line-height: 1;
    color: rgb(var(--nx-fg));
  }
  .unit {
    font-size: var(--stat-unit);
    font-weight: 400;
    color: rgba(var(--nx-ac), 0.6);
    margin-left: 4px;
  }
  .note {
    font: 400 9.5px/1.2 var(--font-mono);
    letter-spacing: 0.06em;
  }

  .progress {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .compact .progress {
    gap: 8px;
  }
  .pr {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pr-head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font: 400 var(--pr-label) / 1.2 var(--font-mono);
    letter-spacing: 0.1em;
  }
  .pr-head span:first-child {
    color: rgba(var(--nx-ac), 0.8);
    text-transform: uppercase;
  }
  .pct {
    color: rgb(var(--nx-fg));
  }
  .track {
    position: relative;
    height: var(--track);
    border-radius: 3px;
    background: rgba(var(--nx-mu), 0.22);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: 3px;
    transition: width 0.7s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .detail {
    font: 400 9.5px/1.2 var(--font-mono);
    letter-spacing: 0.06em;
    color: rgba(var(--nx-ac), 0.55);
  }

  .table {
    border: 1px solid rgba(var(--nx-ac), 0.14);
    border-radius: 10px;
    overflow: hidden;
    font: 400 var(--t-font) / 1.3 var(--font-mono);
  }
  .trow {
    display: grid;
    gap: 10px;
    padding: 7px var(--t-pad);
    border-top: 1px solid rgba(var(--nx-ac), 0.08);
  }
  .trow:not(.thead):hover {
    background: rgba(var(--nx-mu), 0.06);
  }
  .trow span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .thead {
    padding: 8px var(--t-pad);
    border-top: none;
    background: rgba(var(--nx-mu), 0.08);
    font-size: 8.5px;
    letter-spacing: 0.16em;
    color: rgba(var(--nx-ac), 0.65);
  }

  .list {
    display: flex;
    flex-direction: column;
  }
  .li {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid rgba(var(--nx-ac), 0.07);
  }
  .mark {
    width: 12px;
    height: 12px;
    display: grid;
    place-items: center;
  }
  .done {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: rgb(var(--nx-ac));
    display: grid;
    place-items: center;
    color: rgb(var(--nx-pn));
    font-size: 8px;
    line-height: 1;
  }
  .active {
    position: relative;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgb(var(--nx-ac));
  }
  .active i {
    position: absolute;
    inset: 2px;
    border-radius: 50%;
    background: rgb(var(--nx-ac));
    animation: nx-flash 1s ease-in-out infinite;
  }
  .todo {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    border: 1px dashed rgba(var(--nx-ac), 0.45);
  }
  .li-text {
    font-size: var(--li);
    color: rgba(var(--nx-ac), 0.85);
    text-wrap: pretty;
  }
  .li-text.dim {
    color: rgba(var(--nx-ac), 0.7);
  }
  .li-text.on {
    color: rgb(var(--nx-fg));
  }
  .meta {
    font: 400 9.5px/1.2 var(--font-mono);
    letter-spacing: 0.08em;
    color: rgba(var(--nx-ac), 0.5);
  }

  .callout {
    display: flex;
    gap: 12px;
    padding: var(--co-pad);
    border: 1px solid;
    border-radius: 10px;
    background: rgba(var(--nx-mu), 0.07);
  }
  .diamond {
    width: 7px;
    height: 7px;
    flex: none;
    margin-top: 5px;
    transform: rotate(45deg);
  }
  .callout-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .callout-title {
    font: 400 10px/1.2 var(--font-mono);
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .callout-text {
    font-size: var(--co-text);
    line-height: 1.5;
    color: rgb(var(--nx-fg));
    opacity: 0.85;
    text-wrap: pretty;
  }

  .kv {
    display: flex;
    flex-direction: column;
  }
  .kv-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
    border-top: 1px solid rgba(var(--nx-ac), 0.1);
    font: 400 var(--kv) / 1.3 var(--font-mono);
  }
  .kv-row span:last-child {
    text-align: right;
  }
  .k {
    color: rgba(var(--nx-ac), 0.7);
    letter-spacing: 0.06em;
  }

  .code {
    border: 1px solid rgba(var(--nx-ac), 0.14);
    border-radius: 10px;
    overflow: hidden;
    background: rgba(var(--nx-sh), 0.28);
  }
  .lang {
    padding: 6px var(--code-pad);
    border-bottom: 1px solid rgba(var(--nx-ac), 0.1);
    font: 400 8.5px/1.2 var(--font-mono);
    letter-spacing: 0.18em;
    color: rgba(var(--nx-ac), 0.55);
  }
  pre {
    margin: 0;
    padding: 10px var(--code-pad);
    overflow-x: auto;
    font: 400 var(--code) / 1.6 var(--font-mono);
    color: rgb(var(--nx-fg));
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tag {
    font: 400 9.5px/1.2 var(--font-mono);
    letter-spacing: 0.12em;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid;
  }

  .divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(var(--nx-ac), 0.3), transparent);
  }
</style>
