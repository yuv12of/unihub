import type { Metadata, Viewport } from "next";
// Fonts are bundled from npm (no build-time call to Google Fonts).
import "@fontsource-variable/heebo";
import "@fontsource/secular-one/hebrew-400.css";
import "@fontsource/secular-one/latin-400.css";
import "./globals.css";

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
            __html: `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
