/**
 * A coarse "Browser on OS" hint from a User-Agent string (SRS ACC-05).
 *
 * Check order matters: Edge UAs also contain `Chrome/`, and Chrome UAs also
 * contain `Safari/`, so the more specific browser token is tested first.
 * Likewise the iPhone/iPad UA contains "Mac OS X" and the Android UA contains
 * "Linux", so the more specific OS token is tested first.
 */
export function deviceHint(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';

  const browser = /Firefox\//.test(userAgent)
    ? 'Firefox'
    : /Edg\//.test(userAgent)
      ? 'Edge'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';

  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /iPhone|iPad|iPod/.test(userAgent)
      ? 'iOS'
      : /Mac OS X|Macintosh/.test(userAgent)
        ? 'macOS'
        : /Android/.test(userAgent)
          ? 'Android'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown OS';

  return `${browser} on ${os}`;
}
