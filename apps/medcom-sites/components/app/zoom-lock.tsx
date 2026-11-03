"use client";

import { useEffect } from "react";

// iOS Safari ignores user-scalable=no, so block its pinch gestures directly.
export function ZoomLock() {
  useEffect(() => {
    const block = (event: Event) => event.preventDefault();
    const multiTouch = (event: TouchEvent) => { if (event.touches.length > 1) event.preventDefault(); };
    const gestures = ["gesturestart", "gesturechange", "gestureend"];
    for (const name of gestures) document.addEventListener(name, block, { passive: false });
    document.addEventListener("touchmove", multiTouch, { passive: false });
    return () => {
      for (const name of gestures) document.removeEventListener(name, block);
      document.removeEventListener("touchmove", multiTouch);
    };
  }, []);
  return null;
}
