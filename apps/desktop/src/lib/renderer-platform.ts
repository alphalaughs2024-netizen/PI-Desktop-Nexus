export function rendererPlatform(): NodeJS.Platform {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Windows/i.test(ua)) return "win32";
  if (/Macintosh|Mac OS/i.test(ua)) return "darwin";
  return window.piDesktop?.platform ?? "linux";
}
