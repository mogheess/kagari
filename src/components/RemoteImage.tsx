/**
 * A cover/thumbnail image that self-heals when a remote url won't load.
 *
 * It first tries the url directly (fast path, no native work). If that fails —
 * typically a Referer-gated or Cloudflare/fingerprint-gated cover CDN — it
 * re-fetches through the native engine, which uses the source's HTTP client
 * (headers + Cloudflare clearance) and returns a local file. Resolved covers
 * are remembered (see `coverCache`) so later views load straight from disk.
 *
 * Drop-in for `<Image>` for covers: pass `uri` (+ `sourceId` when known) instead
 * of `source`. Renders `fallback` (default: nothing) when there's no url or the
 * cover ultimately can't be loaded.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  type ImageProps,
  type ImageErrorEventData,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  peekCover,
  resolveCover,
  invalidateCover,
  isLocalUri,
} from '../engine/coverCache';

interface RemoteImageProps extends Omit<ImageProps, 'source'> {
  uri: string | undefined | null;
  /** Source the cover belongs to; lets the native fetch use the right client. */
  sourceId?: string;
  /** Rendered when there's no url or the cover can't be loaded at all. */
  fallback?: React.ReactNode;
}

export function RemoteImage({
  uri,
  sourceId,
  fallback = null,
  onError,
  ...rest
}: RemoteImageProps) {
  const [display, setDisplay] = useState<string | undefined>(() =>
    uri && !isLocalUri(uri) ? peekCover(uri) ?? uri : uri ?? undefined,
  );
  const triedRef = useRef(false);

  useEffect(() => {
    triedRef.current = false;
    if (!uri) {
      setDisplay(undefined);
      return;
    }
    if (isLocalUri(uri)) {
      setDisplay(uri);
      return;
    }
    setDisplay(peekCover(uri) ?? uri);
  }, [uri]);

  const handleError = useCallback(
    (e: NativeSyntheticEvent<ImageErrorEventData>) => {
      onError?.(e);
      if (!uri || isLocalUri(uri) || triedRef.current) {
        setDisplay(undefined);
        return;
      }
      triedRef.current = true;
      // A direct load (or a stale cached file) failed: drop any mapping and
      // re-fetch through the source's client, which handles Referer/Cloudflare.
      invalidateCover(uri);
      resolveCover(sourceId ?? '', uri).then(next => {
        setDisplay(next && isLocalUri(next) ? next : undefined);
      });
    },
    [onError, sourceId, uri],
  );

  if (!display) return <>{fallback}</>;
  return <Image {...rest} source={{ uri: display }} onError={handleError} />;
}
