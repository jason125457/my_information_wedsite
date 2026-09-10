import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Feed",
  description: "A quieter, higher-signal way to follow what matters.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
