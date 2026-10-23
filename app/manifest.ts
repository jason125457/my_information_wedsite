import type { MetadataRoute } from "next";

/** Installable web app: "Add to Home Screen" opens Personal Feed full-screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal Feed",
    short_name: "Feed",
    description: "少而精的每日資訊：AI 從你在意的主題中替你挑出真正值得看的內容。",
    lang: "zh-Hant",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#f6f4ef",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "每日精選", url: "/digest" },
      { name: "收藏", url: "/saved" },
    ],
  };
}
