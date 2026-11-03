import type { Metadata, Viewport } from "next";
import { MedcomThemeIcons } from "@/components/brand/medcom-logo";
import { ZoomLock } from "@/components/app/zoom-lock";
import "./globals.css";
// Kept apart from globals.css so loading effects ship even when a stale build cache reuses it.
import "./loading-effects.css";

export const metadata: Metadata = {
  title: "Medcom ERP",
  description: "Không gian làm việc ERP Medcom: mua hàng, kho, kế toán và chứng từ.",
  icons: {
    icon: "/medcom-logo.png",
    shortcut: "/medcom-logo.png",
    apple: "/apple-touch-icon.png",
  },
  // iPhone "Thêm vào MH chính" opens the Web full screen with this name under the icon.
  appleWebApp: { capable: true, title: "Medcom", statusBarStyle: "default" },
};

// The owner wants the Web fixed at 100% on phones: no input-focus auto zoom, no double-tap or pinch zoom.
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased"><MedcomThemeIcons /><ZoomLock />{children}</body>
    </html>
  );
}
