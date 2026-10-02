import { FilePenLine, Hand, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PermissionMode } from "@pi-desktop/shared";

export function PermissionModeContents({ mode, label }: { mode: PermissionMode; label: string }) {
  const { t } = useTranslation();
  const Icon = mode === "ask" ? Hand : mode === "full-access" ? ShieldAlert : mode === "accept-edits" ? FilePenLine : ShieldCheck;
  return <>
    <Icon size={18} aria-hidden="true" className="composer-permission-option-icon" />
    <span className="composer-permission-option-copy">
      <span className="composer-permission-option-label">{label}</span>
      <span className="composer-permission-option-description">{t(`chat.permissionDescription.${mode}`)}</span>
    </span>
  </>;
}
