"use client";

import { useEffect, useState, useTransition } from "react";
import { spotifyDisconnect, spotifyNow } from "@/app/spotifyActions";
import type { SpotifyState } from "@/lib/spotify";

const RESULT: Record<string, string> = {
  ok: "Spotify מחובר. מעכשיו המוזיקה מתחילה ונעצרת עם טיימר הריכוז.",
  denied: "החיבור בוטל.",
  notallowed: "Spotify עוד לא מאשר את החשבון הזה. בקשו ממנהל האתר להוסיף את המייל שלכם ב־Spotify ואז נסו שוב.",
  error: "החיבור לא הצליח. נסו שוב.",
  off: "החיבור ל־Spotify עוד לא הוגדר באתר.",
};

/** Connect / disconnect Spotify for full playback control from the focus timer. */
export function SpotifyCard() {
  const [sp, setSp] = useState<SpotifyState | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("spotify");
    if (r) setNote(RESULT[r] ?? null);
    spotifyNow().then(setSp, () => {});
  }, []);
  if (!sp?.enabled) return note ? <p className="mt-4 text-sm">{note}</p> : null;

  return (
    <div id="music" className="mt-6 scroll-mt-24 border-t border-rule pt-5">
      <h3 className="font-medium">Spotify</h3>
      {sp.connected ? (
        <div className="mt-2 space-y-2 text-sm">
          <p>
            מחובר{sp.name ? ` בתור ${sp.name}` : ""}.
            {sp.playing ? ` עכשיו: ${sp.playing.title} · ${sp.playing.artist}` : ""}
          </p>
          <p className="text-ink-soft">בטיימר הריכוז יש נגן מלא: נגינה, עצירה, דילוג, עוצמה, בחירת מכשיר והפלייליסטים שלך.</p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await spotifyDisconnect();
                setSp({ ...sp, connected: false, playing: null });
                setNote("Spotify נותק.");
              })
            }
            className="text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink"
          >
            ניתוק
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-ink-soft">
            שליטה מלאה מהטיימר: המוזיקה מתחילה כשמתחילים ללמוד, נעצרת בהפסקה ובסוף. דורש Spotify Premium.
          </p>
          <a href="/api/spotify/login" className="inline-block rounded-lg bg-ink px-4 py-2 font-medium text-bg">
            חיבור Spotify
          </a>
        </div>
      )}
      {note && <p className="mt-2 text-sm">{note}</p>}
    </div>
  );
}
