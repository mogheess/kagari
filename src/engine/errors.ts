/**
 * Classifies errors thrown by the native engine.
 *
 * The bridge rejects with a `code` string; React Native surfaces it as
 * `error.code`. Most codes only matter for logging, but a Cloudflare human
 * check is different: nothing the app retries will get past it, and the fix
 * (open the site in the visible WebView, tick the box) is something only the
 * user can do — so the UI should say that instead of "didn't respond".
 */
export type EngineErrorKind = 'cloudflare_interactive' | 'cloudflare' | 'other';

export function engineErrorKind(error: unknown): EngineErrorKind {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'cloudflare_interactive') return 'cloudflare_interactive';
  if (code === 'cloudflare') return 'cloudflare';
  return 'other';
}

/** True when the only way forward is the user passing a check in the WebView. */
export function needsHumanCheck(error: unknown): boolean {
  return engineErrorKind(error) === 'cloudflare_interactive';
}
