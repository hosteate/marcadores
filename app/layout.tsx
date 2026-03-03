import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "marcadores.live",
  description: "Marcadores y momios (informativo)",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="bg-white">
      <head>
        {/* ✅ Evita “auto dark / auto contrast” raro en iOS */}
        <meta name="color-scheme" content="only light" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="bg-white text-black">{children}</body>
    </html>
  );
}