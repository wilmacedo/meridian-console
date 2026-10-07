export type LayoutMode = 'auto' | 'side' | 'stacked'

export const LAYOUT_MODES: readonly LayoutMode[] = ['auto', 'side', 'stacked']

// A viewport this much taller than it is wide is a monitor turned to portrait.
const PORTRAIT_RATIO = 1.15

// Whether the rails lie along the top and bottom (stacked) rather than on the sides.
export function isStackedFor(mode: LayoutMode, width: number, height: number): boolean {
  return mode === 'stacked' || (mode === 'auto' && height > width * PORTRAIT_RATIO)
}
