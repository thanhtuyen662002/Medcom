"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useSyncExternalStore } from "react";

const LIGHT_LOGO = "/medcom-logo.png";
const DARK_LOGO = "/medcom-logo-dark.png";

function subscribeTheme(onChange: () => void) {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function isDarkTheme() {
  return typeof document !== "undefined" && document.documentElement?.classList?.contains("dark") === true;
}

const serverTheme = () => false;

export function MedcomLogo({ alt = "MEDCOMTECH", ...props }: Omit<ImageProps, "src" | "alt"> & { alt?: string }) {
  const dark = useSyncExternalStore(subscribeTheme, isDarkTheme, serverTheme);
  return <Image {...props} src={dark ? DARK_LOGO : LIGHT_LOGO} alt={alt} data-medcom-logo={dark ? "dark" : "light"} />;
}

/** Keep tab icons aligned with manual theme selection, including navigation. */
export function MedcomThemeIcons() {
  const dark = useSyncExternalStore(subscribeTheme, isDarkTheme, serverTheme);
  useEffect(() => {
    const href = dark ? DARK_LOGO : LIGHT_LOGO;
    const syncIcons = () => {
      document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"],link[rel="shortcut icon"]').forEach(link => {
        const current = new URL(link.href, window.location.href).pathname;
        if ((current === LIGHT_LOGO || current === DARK_LOGO) && link.getAttribute("href") !== href) link.setAttribute("href", href);
      });
    };
    syncIcons();
    const observer = new MutationObserver(syncIcons);
    observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    return () => observer.disconnect();
  }, [dark]);
  return null;
}
