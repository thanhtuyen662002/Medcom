"use client";

import {useSyncExternalStore} from "react";
import {Search} from "lucide-react";
import {Button} from "@/components/ui/button";

const subscribe = () => () => {};
const serverPlatform = () => "";
const browserPlatform = () => navigator.platform;

/** Presentation only. Workspace retains the guarded keyboard listener. */
export function screenFinderShortcut(platform: string) {
  const apple = /Mac|iPhone|iPad|iPod/i.test(platform);
  return {label: apple ? "Cmd+K" : "Ctrl+K", keys: apple ? "Meta+K" : "Control+K"};
}

export function useScreenFinderShortcut() {
  return screenFinderShortcut(useSyncExternalStore(subscribe, browserPlatform, serverPlatform));
}

export function WorkspaceSearch({open, onOpen, shortcut}: {
  open: boolean; onOpen: () => void; shortcut: ReturnType<typeof screenFinderShortcut>;
}) {
  return <Button type="button" variant="outline" className="global-search" onClick={onOpen}
    aria-label="Tìm màn hình" aria-haspopup="dialog" aria-expanded={open} aria-keyshortcuts={shortcut.keys}>
    <Search size={15} aria-hidden="true"/>
    <span className="global-search-label">Tìm màn hình…</span>
    <kbd aria-hidden="true">{shortcut.label}</kbd>
  </Button>;
}
