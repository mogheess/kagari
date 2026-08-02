import { thumbTopForDrag } from '../fastScrollerMath';

describe('thumbTopForDrag', () => {
  test('applies cumulative gesture distance to the drag start', () => {
    expect(thumbTopForDrag(20, 15, 100)).toBe(35);
    expect(thumbTopForDrag(20, 30, 100)).toBe(50);
  });

  test('clamps the thumb to the track', () => {
    expect(thumbTopForDrag(20, -50, 100)).toBe(0);
    expect(thumbTopForDrag(80, 50, 100)).toBe(100);
  });
});
