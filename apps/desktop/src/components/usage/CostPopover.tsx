import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../stores/app-store";
import { useUsageLedger } from "../../lib/use-usage-ledger";
import { coverage, formatCount, formatSpend, spendTotal } from "../../lib/usage-view";
import { ProviderUsage } from "./ProviderUsage";
import { IconClose, IconRefresh } from "../icons";

export function CostPopover({ sessionId, onClose }: { sessionId?: string; onClose(): void }) {
  const [scope, setScope] = useState<"chat" | "all">(sessionId ? "chat" : "all");
  const { data, loading, error, refresh } = useUsageLedger(scope === "chat" && sessionId ? { sessionId } : {});
  const providers = useAppStore(s => s.providers);
  const session = useAppStore(s => s.sessions.find(item => item.id === sessionId));
  const draftProvider = useAppStore(s => s.draftConfiguration?.providerId);
  const defaultProvider = useAppStore(s => s.settings?.defaultProviderId);
  const provider = providers.find(p => p.id === (session?.providerId ?? draftProvider ?? defaultProvider));
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); previous?.focus(); };
  }, [onClose]);
  const totals = data?.totals;
  return <div ref={panel} className="cost-summary-popover billing-popover" role="dialog" aria-label="Spend and limits" aria-busy={loading}>
    <header><strong>Spend &amp; limits</strong><div><button className="billing-icon" title="Refresh usage" aria-label="Refresh usage" disabled={loading} onClick={() => void refresh()}><IconRefresh size={15} /></button><button className="billing-icon" title="Close" aria-label="Close spend and limits" onClick={onClose}><IconClose size={15} /></button></div></header>
    <div className="billing-segments" role="group" aria-label="Usage scope"><button type="button" disabled={!sessionId} aria-pressed={scope === "chat"} onClick={() => setScope("chat")}>This chat</button><button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>All Nexus usage</button></div>
    <section className="billing-popover-total"><strong>{spendTotal(totals)}</strong><span>{error ? "Usage refresh failed" : coverage(totals)}</span><small>{totals ? `${formatCount(totals.turnCount)} turns · ${formatCount(totals.totalTokens)} tokens` : "Loading…"}</small></section>
    {totals?.pricedRequests ? <dl className="billing-cost-split"><div><dt>Reported</dt><dd>{formatSpend(totals.reportedUsd)}</dd></div><div><dt>Estimated</dt><dd>{formatSpend(totals.estimatedUsd)}</dd></div></dl> : null}
    {!!totals?.unknownRequests && <p className="billing-note">{formatCount(totals.unknownRequests)} requests or older turns without a price.</p>}
    {provider && <ProviderUsage provider={provider} compact />}
    <footer><small>Provider totals may include usage outside Nexus.</small><button type="button" onClick={() => { onClose(); useAppStore.getState().setSettingsTab("usage"); }}>View usage details</button></footer>
  </div>;
}
