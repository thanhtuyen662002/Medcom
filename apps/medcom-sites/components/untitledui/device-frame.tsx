"use client";

import React from "react";

export type DeviceMode = "mobile" | "tablet" | "full";

export interface DeviceFrameProps {
  deviceMode?: DeviceMode;
  onDeviceModeChange?: (mode: DeviceMode) => void;
  isDarkMode: boolean;
  onToggleDarkMode?: () => void;
  children: React.ReactNode;
}

/**
 * Responsive Shell for Medcom ERP
 * Provides true full-bleed responsiveness across Mobile (<768px),
 * Tablet (768px-1024px), and Desktop (>1024px) without artificial simulator frames.
 */
export function DeviceFrame({
  isDarkMode,
  children,
}: DeviceFrameProps) {
  return (
    <div
      className={`min-h-screen w-full transition-colors ${
        isDarkMode ? "dark bg-neutral-950 text-white" : "bg-neutral-50 text-neutral-900"
      }`}
    >
      <div className="w-full min-h-screen flex flex-col">{children}</div>
    </div>
  );
}
