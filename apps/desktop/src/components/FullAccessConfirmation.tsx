import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

export function FullAccessConfirmation({ onCancel, onConfirm }: { onCancel(): void; onConfirm(): Promise<void> }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const confirm = async () => {
    if (submitting.current) return;
    submitting.current = true; setPending(true); setError("");
    try { await onConfirm(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { submitting.current = false; setPending(false); }
  };
  return createPortal(
    <div className="overlay composer-full-access-overlay" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !submitting.current) onCancel();
    }}>
      <div ref={ref} className="dialog composer-full-access-dialog" role="dialog" aria-modal="true"
        aria-labelledby="composer-full-access-title" aria-describedby="composer-full-access-description" aria-busy={pending}
        onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!submitting.current) onCancel(); }
          if (event.key === "Tab") {
            event.preventDefault();
            const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
          }
        }}>
        <h2 id="composer-full-access-title">{t("chat.permissionFullAccessTitle")}</h2>
        <p id="composer-full-access-description">{t("chat.permissionFullAccessDescription")}</p>
        <ul>
          {["Files", "Terminal", "Internet", "SensitiveData", "PromptInjection"].map(key => <li key={key}>{t(`chat.permissionFullAccess${key}`)}</li>)}
        </ul>
        {error && <p role="alert">{error}</p>}
        <div className="composer-full-access-actions">
          <button type="button" aria-disabled={pending} onClick={() => { if (!submitting.current) onCancel(); }}>{t("common.cancel")}</button>
          <button type="button" className="danger" aria-disabled={pending} onClick={() => void confirm()}>{t("chat.permissionFullAccessConfirm")}</button>
        </div>
      </div>
    </div>, document.body,
  );
}
