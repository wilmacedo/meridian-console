<script lang="ts">
  // A line over a faint area, drawn on a 120-wide canvas stretched to its container.
  let { values, max, color, height = 36, span = 30, stroke = 1.4, fill = 0.12 }: { values: number[]; max: number; color: string; height?: number; span?: number; stroke?: number; fill?: number } = $props()

  const points = $derived(values.map((v, i) => `${((i / Math.max(1, values.length - 1)) * 120).toFixed(1)},${(height - 2 - (Math.min(v, max) / max) * span).toFixed(1)}`).join(' '))
</script>

<svg viewBox="0 0 120 {height}" preserveAspectRatio="none" {height}>
  {#if values.length > 1}
    <polygon points="0,{height} {points} 120,{height}" fill={color} fill-opacity={fill}></polygon>
    <polyline {points} fill="none" stroke={color} stroke-width={stroke} vector-effect="non-scaling-stroke"></polyline>
  {/if}
</svg>

<style>
  svg {
    width: 100%;
    display: block;
  }
</style>
