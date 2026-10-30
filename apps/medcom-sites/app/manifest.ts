import type { MetadataRoute } from "next";

// Lets phones add Medcom to the home screen as an app: its own icon, opened full screen without the address bar.
// The icons are the Medcom logo on white; the maskable one leaves room for Android's round or squircle crop.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Medcom ERP",
    short_name: "Medcom",
    description: "Không gian làm việc ERP Medcom: mua hàng, kho, kế toán và chứng từ.",
    lang: "vi",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
