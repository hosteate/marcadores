import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "marcadores.live",
  description: "Marcadores y líneas (promedio) para MLB, NBA, NCAA",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}