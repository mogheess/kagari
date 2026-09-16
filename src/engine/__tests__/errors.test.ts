import { engineErrorKind, needsHumanCheck } from '../errors';

test('recognises the bridge codes for Cloudflare', () => {
  expect(engineErrorKind({ code: 'cloudflare_interactive', message: 'x' })).toBe('cloudflare_interactive');
  expect(engineErrorKind({ code: 'cloudflare', message: 'x' })).toBe('cloudflare');
  expect(needsHumanCheck({ code: 'cloudflare_interactive' })).toBe(true);
  expect(needsHumanCheck({ code: 'cloudflare' })).toBe(false);
});

test('anything else is an ordinary error', () => {
  expect(engineErrorKind(new Error('boom'))).toBe('other');
  expect(engineErrorKind(null)).toBe('other');
  expect(engineErrorKind('string')).toBe('other');
  expect(needsHumanCheck(undefined)).toBe(false);
});
