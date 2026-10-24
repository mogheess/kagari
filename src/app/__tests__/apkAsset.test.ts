import { pickApkAsset } from '../apkAsset';

const split = [
  { name: 'Kagari-v0.7.0-armeabi-v7a.apk' },
  { name: 'Kagari-v0.7.0-arm64-v8a.apk' },
  { name: 'Kagari-v0.7.0-x86.apk' },
  { name: 'Kagari-v0.7.0-x86_64.apk' },
  { name: 'Kagari-v0.7.0-universal.apk' },
  { name: 'checksums.txt' },
];

describe('pickApkAsset', () => {
  it('picks the APK for the preferred ABI', () => {
    expect(pickApkAsset(split, ['arm64-v8a', 'armeabi-v7a'])?.name).toBe(
      'Kagari-v0.7.0-arm64-v8a.apk',
    );
  });

  it('does not confuse x86 with x86_64', () => {
    expect(pickApkAsset(split, ['x86'])?.name).toBe('Kagari-v0.7.0-x86.apk');
    expect(pickApkAsset(split, ['x86_64', 'x86'])?.name).toBe('Kagari-v0.7.0-x86_64.apk');
  });

  it('falls back to a later ABI when the first has no APK', () => {
    const noArm64 = split.filter(a => !a.name.includes('arm64'));
    expect(pickApkAsset(noArm64, ['arm64-v8a', 'armeabi-v7a'])?.name).toBe(
      'Kagari-v0.7.0-armeabi-v7a.apk',
    );
  });

  it('falls back to the universal APK when the ABI is unknown', () => {
    expect(pickApkAsset(split, [])?.name).toBe('Kagari-v0.7.0-universal.apk');
    expect(pickApkAsset(split, ['riscv64'])?.name).toBe('Kagari-v0.7.0-universal.apk');
  });

  it('handles single-APK releases', () => {
    expect(pickApkAsset([{ name: 'Kagari-v0.6.1.apk' }], ['arm64-v8a'])?.name).toBe(
      'Kagari-v0.6.1.apk',
    );
    expect(pickApkAsset([{ name: 'Kagari-v0.7.apk' }], ['arm64-v8a', 'armeabi-v7a'])?.name).toBe(
      'Kagari-v0.7.apk',
    );
  });

  it('returns undefined when there is no APK', () => {
    expect(pickApkAsset([{ name: 'notes.txt' }], ['arm64-v8a'])).toBeUndefined();
  });
});
