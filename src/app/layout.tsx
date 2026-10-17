import type { Metadata, Viewport } from "next";
// Fonts are bundled from npm (no build-time call to Google Fonts).
import "@fontsource-variable/heebo";
import "@fontsource/secular-one/hebrew-400.css";
import "@fontsource/secular-one/latin-400.css";
// Faces used by the optional styles (only downloaded when a style uses them).
import "@fontsource/varela-round/hebrew-400.css";
import "@fontsource/varela-round/latin-400.css";
import "@fontsource-variable/rubik/wght.css";
import "@fontsource/frank-ruhl-libre/hebrew-700.css";
import "@fontsource/frank-ruhl-libre/latin-700.css";
import "./globals.css";
import { LOOK_BOOT } from "@/lib/themes";

export const metadata: Metadata = {
  title: "Unihub",
  description: "העוזר האישי שלי ללימודים באוניברסיטה הפתוחה",
  appleWebApp: { capable: true, title: "Unihub", statusBarStyle: "default" },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // Lets the page extend under the iPhone home bar so safe-area padding is reported.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1322" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Apply the saved light/dark choice before the first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: LOOK_BOOT,
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
