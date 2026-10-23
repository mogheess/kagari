import { countChanged, nextTriState, updateFilterAt } from '../filters';
import type { FilterDto } from '../../engine/types';

const defaults: FilterDto[] = [
  { type: 'header', name: 'Note' },
  { type: 'select', name: 'Type', values: ['All', 'Manga'], state: 0 },
  {
    type: 'group',
    name: 'Tags',
    filters: [
      { type: 'checkbox', name: 'Action', state: false },
      { type: 'checkbox', name: 'Romance', state: false },
    ],
  },
  { type: 'sort', name: 'Sort', values: ['Latest', 'Popular'], state: { index: 0, ascending: false } },
];

test('nothing changed counts zero', () => {
  expect(countChanged(defaults, defaults)).toBe(0);
});

test('updates nested filters by path without touching the rest', () => {
  const edited = updateFilterAt(defaults, [2, 1], f => (f.type === 'checkbox' ? { ...f, state: true } : f));
  expect(edited[2]).not.toBe(defaults[2]);
  expect(edited[1]).toBe(defaults[1]);
  expect(countChanged(edited, defaults)).toBe(1);
});

test('counts a changed select and sort', () => {
  let edited = updateFilterAt(defaults, [1], f => (f.type === 'select' ? { ...f, state: 1 } : f));
  edited = updateFilterAt(edited, [3], f => (f.type === 'sort' ? { ...f, state: { index: 1, ascending: true } } : f));
  expect(countChanged(edited, defaults)).toBe(2);
});

test('tri-state cycles through all three states', () => {
  expect([0, 1, 2].map(nextTriState)).toEqual([1, 2, 0]);
});
