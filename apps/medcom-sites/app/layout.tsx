import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Medcom ERP",
  description: "Không gian làm việc ERP Medcom: mua hàng, kho, kế toán và chứng từ.",
  icons: {
    icon: "/medcom-logo.png",
    shortcut: "/medcom-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
