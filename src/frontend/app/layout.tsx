import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = { title: "Medcom · Không gian làm việc", description: "Không gian làm việc Medcom ERP" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body><Providers>{children}</Providers></body></html>;
}
