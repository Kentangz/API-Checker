import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "API Key Checker",
  description: "Local-first API key checker for public Vercel deployments."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
