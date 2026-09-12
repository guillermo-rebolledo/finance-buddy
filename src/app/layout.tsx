import type { Metadata } from "next";
import { colorSchemeScript } from "@/lib/appearance";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";
export const metadata: Metadata = {
  title: "Finance Buddy",
  description: "Your private personal finance journal.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The root element's mode class and scheme attributes are set before
  // hydration from this browser's stored appearance, so they differ from the
  // server's markup by design.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: colorSchemeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
