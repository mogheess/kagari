/** Maps a PanResponder's cumulative drag distance onto the scrollbar track. */
export function thumbTopForDrag(start: number, dy: number, travel: number): number {
  return Math.min(Math.max(start + dy, 0), travel);
}
