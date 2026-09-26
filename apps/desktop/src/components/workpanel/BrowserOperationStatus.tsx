export function BrowserOperationStatus({ operation = "" }: { operation?: string }) {
  return <p id="browser-operation-status" className="browser-operation-status" role="status" aria-live="polite">{operation}</p>;
}
