import { useCallback, useEffect, useRef, useState } from "react";
import type { ProviderAccountResult, UsageLedger, UsageLedgerQuery } from "@pi-desktop/shared";
import { api } from "./api";

export function useUsageLedger(query: UsageLedgerQuery, enabled = true) {
  const key = JSON.stringify(query);
  const generation = useRef(0);
  const [data, setData] = useState<UsageLedger>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const next = await api.getUsageLedger(JSON.parse(key));
      if (current === generation.current) { setData(next); setError(false); }
    } catch { if (current === generation.current) setError(true); }
    finally { if (current === generation.current) setLoading(false); }
  }, [key]);
  useEffect(() => {
    if (!enabled) return;
    setData(undefined); void refresh();
    let timer: number | undefined;
    const off = api.onAgentEvent(event => {
      if (query.sessionId && query.sessionId !== event.sessionId) return;
      if (["agent_end", "turn_end", "error"].includes(event.event.type)) {
        window.clearTimeout(timer); timer = window.setTimeout(() => void refresh(), 250);
      }
    });
    // Refresh while a request is running, including delegate usage and interrupted calls.
    const interval = window.setInterval(() => void refresh(), 10_000);
    return () => { ++generation.current; off(); window.clearTimeout(timer); window.clearInterval(interval); };
  }, [key, enabled, refresh]);
  return { data, loading, error, refresh };
}

export function useProviderAccount(providerId: string | undefined) {
  const [data, setData] = useState<ProviderAccountResult>();
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!providerId) { setLoading(false); return; }
    const current = ++generation.current; setLoading(true);
    try {
      const next = await api.getProviderAccount({ providerId });
      if (current === generation.current) setData(next);
    } catch {
      if (current === generation.current) setData(previous => previous ? { ...previous, snapshot: { ...previous.snapshot, state: "stale", error: "refresh_failed" } }
        : { snapshot: { provider: providerId, scope: "key", state: "unavailable", error: "refresh_failed" } });
    } finally { if (current === generation.current) setLoading(false); }
  }, [providerId]);
  useEffect(() => {
    setData(undefined); void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { ++generation.current; window.clearInterval(timer); };
  }, [refresh]);
  return { data, loading, refresh };
}
