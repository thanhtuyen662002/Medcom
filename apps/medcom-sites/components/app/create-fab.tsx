"use client";

import { Plus } from "lucide-react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AppButton } from "./app-button";

const subscribe = () => () => {};
const getHost = () => typeof document === "undefined" ? null : document.body;
const getServerHost = () => null;

export interface CreateFabProps { allowed: boolean; label: string; onClick: () => void; disabled?: boolean }

export function CreateFab({ allowed, label, onClick, disabled }: CreateFabProps) {
  const host = useSyncExternalStore(subscribe, getHost, getServerHost);
  if (!allowed || !host) return null;
  // Bottom nav: 56px control + 8px padding + 1px border; keep 16px clear.
  return createPortal(<AppButton size="icon" aria-label={label} onClick={onClick} disabled={disabled}
    className="fixed right-4 z-40 size-14 rounded-full shadow-lg md:hidden" style={{ bottom: "calc(81px + env(safe-area-inset-bottom))" }}>
    <Plus aria-hidden="true" className="size-6" />
  </AppButton>, host);
}
