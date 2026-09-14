import type { Metadata } from "next";
import { colorSchemeScript } from "@/lib/appearance";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
export const metadata: Metadata = {
  title: "Finance Buddy",
  description: "A private place to keep track of your money.",
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
        <ThemeProvider>
          {children}
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
