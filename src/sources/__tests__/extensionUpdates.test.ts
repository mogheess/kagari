import type { AvailableExtensionDto, Engine, ExtensionDto } from '../../engine/types';
import { checkExtensionUpdates } from '../extensionUpdates';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

test('a forced check waits for the queued rerun to finish', async () => {
  const installedFirst = deferred<ExtensionDto[]>();
  const availableFirst = deferred<AvailableExtensionDto[]>();
  const installedForced = deferred<ExtensionDto[]>();
  const availableForced = deferred<AvailableExtensionDto[]>();
  const engine = {
    listExtensions: jest.fn().mockReturnValueOnce(installedFirst.promise).mockReturnValueOnce(installedForced.promise),
    getAvailableExtensions: jest
      .fn()
      .mockReturnValueOnce(availableFirst.promise)
      .mockReturnValueOnce(availableForced.promise),
  } as unknown as Engine;

  const automatic = checkExtensionUpdates(engine, { force: true });
  let forcedSettled = false;
  const forced = checkExtensionUpdates(engine, { force: true }).then(() => {
    forcedSettled = true;
  });

  installedFirst.resolve([]);
  availableFirst.resolve([]);
  await Promise.resolve();
  await Promise.resolve();

  expect(engine.listExtensions).toHaveBeenCalledTimes(2);
  expect(forcedSettled).toBe(false);

  installedForced.resolve([]);
  availableForced.resolve([]);
  await Promise.all([automatic, forced]);
  expect(forcedSettled).toBe(true);
});
