import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Finance Buddy",
  description: "Your private personal finance journal.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
