/** One shimmering placeholder bar; the sweep stops under prefers-reduced-motion. */
export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`medcom-shimmer h-4 rounded-md ${className}`} />;
}

/** Placeholder for a detail card's label/value grid while a document loads. */
export function DetailSkeleton({ label, fields = 6 }: { label: string; fields?: number }) {
  return <div role="status" aria-busy="true" aria-label={label}>
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="grid grid-cols-2 gap-x-5 gap-y-5">
      {Array.from({ length: fields }, (_, index) => <div key={index} className="space-y-2">
        <SkeletonBar className="h-3 w-2/5" /><SkeletonBar className={`h-5 ${index % 3 === 1 ? "w-3/5" : "w-4/5"}`} />
      </div>)}
    </div>
  </div>;
}

/** Short stacked list placeholder (choices, permissions, steps). */
export function ListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return <div role="status" aria-busy="true" aria-label={label} className="space-y-2 py-1">
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, index) => <SkeletonBar key={index} className={`h-9 rounded-lg ${index % 2 ? "w-4/5" : "w-full"}`} />)}
  </div>;
}

/** First-load splash: the brand mark breathing over an indeterminate progress bar. */
export function AppSplash({ label }: { label: string }) {
  return <div role="status" aria-busy="true" aria-label={label} className="flex min-h-screen w-full items-center justify-center bg-neutral-50 dark:bg-neutral-950">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="flex w-48 flex-col items-center gap-6">
      {/* Plain images: the splash renders before anything else and must not depend on theme state. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/medcom-logo.png" alt="" width={2065} height={761} className="h-14 w-auto motion-safe:animate-pulse dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/medcom-logo-dark.png" alt="" width={2065} height={761} className="hidden h-14 w-auto motion-safe:animate-pulse dark:block" />
      <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div className="medcom-progress h-full w-2/5 rounded-full bg-brand-600 dark:bg-brand-400" />
      </div>
    </div>
  </div>;
}
