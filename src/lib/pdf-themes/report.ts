import { professionalTheme } from "./professional";
import type { PdfcnTheme } from "@/types/pdf-themes";

// Print-first Finance Buddy theme. All fonts are built into the renderer;
// exports never need to fetch fonts or send journal data to another service.
export const reportTheme: PdfcnTheme = {
  ...professionalTheme,
  name: "finance-buddy",
  colors: {
    ...professionalTheme.colors,
    foreground: "#202b28",
    primary: "#245c49",
    muted: "#f1f5f2",
    mutedForeground: "#56645e",
    border: "#d9e2dc",
    accent: "#245c49",
    success: "#245c49",
  },
  primitives: {
    ...professionalTheme.primitives,
    typography: { xs: 9, sm: 10, base: 11, lg: 14, xl: 18, "2xl": 24, "3xl": 30 },
  },
  typography: {
    body: { fontFamily: "Helvetica", fontSize: 10, lineHeight: 1.4 },
    heading: {
      ...professionalTheme.typography.heading,
      fontFamily: "Times",
      fontSize: { h1: 28, h2: 17, h3: 14, h4: 12, h5: 11, h6: 10 },
    },
  },
  spacing: {
    page: { marginTop: 44, marginRight: 40, marginBottom: 44, marginLeft: 40 },
    sectionGap: 20,
    paragraphGap: 8,
    componentGap: 12,
  },
};
