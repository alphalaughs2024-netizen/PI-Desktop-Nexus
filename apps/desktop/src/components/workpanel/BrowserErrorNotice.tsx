export function BrowserErrorNotice({ message = "" }: { message?: string }) {
  return <div id="browser-error-notice" className="browser-error-notice" role="alert" aria-live="assertive" aria-hidden={!message}>{message}</div>;
}
