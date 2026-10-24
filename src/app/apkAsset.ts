/**
 * Picks the release APK for this device. Releases ship a single untagged APK
 * (`Kagari-v0.7.apk`, 64-bit ARM). Per-ABI names (`...-arm64-v8a.apk`) and
 * `...-universal.apk` are still understood in case a release carries them.
 */

const ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86'];

export interface NamedAsset {
  name: string;
}

function abiOf(name: string): string | undefined {
  const lower = name.toLowerCase();
  // Match on the suffix so "x86" doesn't claim "x86_64".
  return ABIS.find(abi => lower.endsWith(`-${abi}.apk`));
}

/**
 * The APK matching the device's preferred ABI, else the universal one, else
 * any APK. `deviceAbis` is in preference order (Android's SUPPORTED_ABIS).
 */
export function pickApkAsset<T extends NamedAsset>(
  assets: readonly T[],
  deviceAbis: readonly string[],
): T | undefined {
  const apks = assets.filter(a => a.name.toLowerCase().endsWith('.apk'));
  for (const abi of deviceAbis) {
    const hit = apks.find(a => abiOf(a.name) === abi.toLowerCase());
    if (hit) return hit;
  }
  return (
    apks.find(a => a.name.toLowerCase().endsWith('-universal.apk')) ??
    apks.find(a => !abiOf(a.name)) ??
    apks[0]
  );
}
