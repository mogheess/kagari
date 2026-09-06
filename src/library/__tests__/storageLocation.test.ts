import { describeStorageLocation } from '../storageLocation';

test('describes app storage when no folder is picked', () => {
  expect(describeStorageLocation(null)).toMatch(/App storage/);
});

test('points at the downloads subfolder of a picked location', () => {
  expect(
    describeStorageLocation({ uri: 'content://x', displayPath: 'Internal storage/Kagari', writable: true }),
  ).toBe('Internal storage/Kagari/downloads');
});

test('flags a location whose grant was lost', () => {
  expect(
    describeStorageLocation({ uri: 'content://x', displayPath: 'SD card (1234-5678)/Kagari', writable: false }),
  ).toMatch(/no longer accessible/);
});
