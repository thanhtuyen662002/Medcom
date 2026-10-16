"use client";

import { useCallback, useLayoutEffect, useState } from "react";

// Share MedcomApp's existing preference and system fallback; never create a
// separate preference for help or persist business/session information.
export function useInheritedTheme() {
  const [dark, setDark] = useState(false);
  const applyTheme = useCallback((value: boolean) => {
    document.documentElement.classList.toggle("dark", value);
    document.body.classList.toggle("dark", value);
    setDark(value);
  }, []);
  useLayoutEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    function syncTheme() {
      let dark = system.matches;
      try {
        const saved = window.localStorage.getItem("medcom.theme.dark");
        if (saved !== null) dark = saved === "true";
      } catch { /* Storage may be unavailable; retain the system preference. */ }
      applyTheme(dark);
    }
    function onStorage(event: StorageEvent) {
      if (event.key === "medcom.theme.dark" || event.key === null) syncTheme();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") syncTheme();
    }
    syncTheme();
    system.addEventListener("change", syncTheme);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", syncTheme);
    window.addEventListener("pageshow", syncTheme);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      system.removeEventListener("change", syncTheme);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", syncTheme);
      window.removeEventListener("pageshow", syncTheme);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [applyTheme]);

  const toggleTheme = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    try { window.localStorage.setItem("medcom.theme.dark", String(next)); }
    catch { /* The visible control still works when persistence is unavailable. */ }
    applyTheme(next);
  }, [applyTheme]);

  return { dark, toggleTheme };
}
