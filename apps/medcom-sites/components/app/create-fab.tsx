"use client";

import { Plus } from "lucide-react";
import { AppButton } from "./app-button";

export interface CreateFabProps { allowed: boolean; label: string; onClick: () => void; disabled?: boolean }

export function CreateFab({ allowed, label, onClick, disabled }: CreateFabProps) {
  if (!allowed) return null;
  return <AppButton size="icon" aria-label={label} onClick={onClick} disabled={disabled}
    className="fixed right-4 z-40 size-14 rounded-full shadow-lg md:hidden" style={{ bottom: "calc(80px + env(safe-area-inset-bottom))" }}>
    <Plus aria-hidden="true" className="size-6" />
  </AppButton>;
}
