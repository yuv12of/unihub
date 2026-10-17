// Unihub service worker: push notifications, and a copy of the last pages you opened so the app
// still opens (with a "not connected" note) on a train or with weak signal.
const PAGES = "unihub-pages-v1";
const ASSETS = "unihub-assets-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isPage = (req, url) =>
  req.mode === "navigate" && url.origin === self.location.origin && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/auth/");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Built files never change under the same name: cache first.
  if (url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname))) {
    event.respondWith(
      caches.open(ASSETS).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) c.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }

  // Pages: always the network first; keep a copy of each one; fall back to the copy when offline.
  if (isPage(req, url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const signedOut = res.redirected && new URL(res.url).pathname.startsWith("/login");
          if (signedOut || url.pathname.startsWith("/login")) caches.delete(PAGES); // never keep someone's pages after sign-out
          else if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .open(PAGES)
            .then((c) => c.match(url.pathname).then((hit) => hit || c.match("/")))
            .then(
              (hit) =>
                hit ||
                new Response("<meta charset=utf-8><p dir=rtl style='font:16px system-ui;padding:2em'>אין חיבור לאינטרנט. Unihub ייפתח כשהחיבור יחזור.</p>", {
                  headers: { "Content-Type": "text/html; charset=utf-8" },
                }),
            ),
        ),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Unihub", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Unihub", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      dir: "rtl",
      lang: "he",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ("focus" in w) return w.navigate(url).then((c) => c && c.focus());
      return self.clients.openWindow(url);
    }),
  );
});
