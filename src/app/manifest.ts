import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Unihub",
    short_name: "Unihub",
    description: "העוזר האישי שלי ללימודים באוניברסיטה הפתוחה",
    lang: "he",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // The page sets the bar colour per light/dark theme; these are the launch-screen defaults.
    background_color: "#0f1520",
    theme_color: "#0f1520",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // "Share → Unihub" on Android / desktop Chrome: a shared PDF goes to the latest meetup's notes.
    // (iPad Safari has no share targets: there the Shortcut from Settings does it.)
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", files: [{ name: "files", accept: ["application/pdf", ".pdf", "image/*"] }] },
    },
    // Long-press the home-screen icon.
    shortcuts: [
      { name: "רישום לימוד", short_name: "רישום", url: "/?log=1", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "הוספה מהירה", short_name: "הוספה", url: "/?add=1", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "טיימר ריכוז", short_name: "טיימר", url: "/?focus=1", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "לוח שנה", short_name: "לוח", url: "/semester", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
