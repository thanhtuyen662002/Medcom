"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { BookOpen } from "lucide-react";
import { AppButton } from "@/components/app/app-button";
import { AppSheet } from "@/components/app/app-sheet";
import { ListSkeleton } from "@/components/app/loading-skeleton";
import { screenGuideId } from "@/lib/help/screen-guides";

// Guide text and screenshots load only when someone opens help.
const GuideArticle = dynamic(() => import("./guide-article").then(module => module.GuideArticle), {
  ssr: false, loading: () => <ListSkeleton label="Đang tải hướng dẫn…" rows={4} />,
});

/** "Hướng dẫn" button of a screen; renders nothing for screens without a ready guide. */
export function ScreenHelp({ screen, title }: { screen: string; title: string }) {
  const [open, setOpen] = useState(false);
  const guideId = screenGuideId(screen);
  if (!guideId) return null;
  return <>
    <AppButton variant="secondary" aria-label={`Hướng dẫn: ${title}`} title="Hướng dẫn sử dụng màn này" onClick={() => setOpen(true)} className="shrink-0 px-3">
      <BookOpen aria-hidden="true" className="size-5" /><span className="hidden sm:inline">Hướng dẫn</span>
    </AppButton>
    <AppSheet open={open} onClose={() => setOpen(false)} title={`Hướng dẫn: ${title}`} presentation="form">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">{open && <GuideArticle guideId={guideId} />}</div>
    </AppSheet>
  </>;
}
