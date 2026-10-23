import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Feed",
  description: "少而精的每日資訊：AI 從你在意的主題中替你挑出真正值得看的內容。",
};

// Google Fonts serves CJK faces in small unicode-range slices, so readers only
// download the glyphs a page uses. Bundling them with next/font would ship
// hundreds of slices with every deploy.
const fontsHref =
  "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600&family=Noto+Serif+TC:wght@600;700&family=Noto+Sans+TC:wght@400;500;700&display=swap";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={fontsHref} />
      </head>
      <body>{children}</body>
    </html>
  );
}
