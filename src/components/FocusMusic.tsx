"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { spotifyDo, spotifyNow, spotifyPlaylists, type SpotifyCommand } from "@/app/spotifyActions";
import { embedUrl, FOCUS_PLAYLISTS, playlistUrl } from "@/lib/focusMusic";
import type { SpotifyState } from "@/lib/spotify";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

/**
 * Music inside the focus timer. With Spotify connected: real controls, and (optionally) the music
 * starts with the timer, pauses with it and stops when the session ends. Without: the embedded player.
 */
export function FocusMusic({ running, over }: { running: boolean; over: boolean }) {
  const [id, setId] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [picking, setPicking] = useState(false);
  const [sp, setSp] = useState<SpotifyState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mine, setMine] = useState<{ id: string; name: string }[] | null>(null);

  useEffect(() => {
    setId(read("music"));
    setAuto(read("musicAuto") !== "0");
    spotifyNow().then(setSp, () => setSp({ enabled: false, connected: false }));
  }, []);

  const connected = !!sp?.connected;
  const reload = useCallback(() => spotifyNow().then(setSp, () => {}), []);
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [connected, reload]);

  const send = useCallback(
    async (c: SpotifyCommand) => {
      const r = await spotifyDo(c);
      setErr(r.ok ? null : (r.error ?? "שגיאה"));
      setTimeout(reload, 600);
      return r.ok;
    },
    [reload],
  );

  // Latest values for the timer-driven effects below.
  const live = useRef({ sp, id, auto });
  live.current = { sp, id, auto };
  const start = useCallback(() => {
    const { sp, id } = live.current;
    const want = id ? `spotify:playlist:${id}` : null;
    if (want && sp?.playing?.context !== want) return send({ cmd: "play", playlist: id, device: sp?.device?.id ?? sp?.devices?.[0]?.id });
    if (!sp?.playing?.isPlaying) return send({ cmd: "play", device: sp?.device ? null : sp?.devices?.[0]?.id });
  }, [send]);

  // Follow the timer: start, pause, resume, and stop at the end.
  const seen = useRef<{ running: boolean; over: boolean } | null>(null);
  useEffect(() => {
    if (!connected || !auto) return;
    const prev = seen.current;
    seen.current = { running, over };
    if (over && !prev?.over) {
      if (prev) send({ cmd: "pause" });
      return;
    }
    if (over) return;
    if (!prev) {
      if (running) start();
    } else if (running !== prev.running) {
      if (running) start();
      else send({ cmd: "pause" });
    }
  }, [connected, auto, running, over, start, send]);
  useEffect(
    () => () => {
      // Timer closed (finished or cancelled).
      if (live.current.sp?.connected && live.current.auto && live.current.sp.playing?.isPlaying) spotifyDo({ cmd: "pause" }).catch(() => {});
    },
    [],
  );

  const choose = (next: string) => {
    setId(next);
    setPicking(false);
    write("music", next);
    if (connected) send({ cmd: "play", playlist: next, device: sp?.device?.id ?? sp?.devices?.[0]?.id });
  };

  const picker = (
    <div className="flex flex-wrap justify-center gap-1.5">
      {FOCUS_PLAYLISTS.map((p) => (
        <button key={p.id} type="button" onClick={() => choose(p.id)} className={`rounded-full border px-3 py-1 text-sm hover:border-ink ${p.id === id ? "border-ink" : "border-rule"}`}>
          {p.emoji} {p.name}
        </button>
      ))}
      {connected &&
        (mine ? (
          mine.map((p) => (
            <button key={p.id} type="button" onClick={() => choose(p.id)} className={`rounded-full border px-3 py-1 text-sm hover:border-ink ${p.id === id ? "border-ink" : "border-rule"}`}>
              🎵 {p.name}
            </button>
          ))
        ) : (
          <button type="button" onClick={() => spotifyPlaylists().then(setMine)} className="rounded-full px-3 py-1 text-sm text-ink-soft underline underline-offset-4 decoration-rule">
            הפלייליסטים שלי
          </button>
        ))}
    </div>
  );

  if (connected) {
    const p = sp?.playing;
    return (
      <div className="mt-5 w-full max-w-sm rounded-2xl bg-bg p-3 text-start ring-1 ring-rule">
        <div className="flex items-center gap-3">
          {p?.image ? <img src={p.image} alt="" className="size-14 shrink-0 rounded-lg object-cover" /> : <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-rule/60 text-2xl">🎧</div>}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{p?.title ?? "שום דבר לא מתנגן"}</p>
            <p className="truncate text-sm text-ink-soft">{p ? p.artist : sp?.device ? sp.device.name : "פתחו את Spotify באחד המכשירים"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1" dir="ltr">
            <button type="button" aria-label="הקודם" onClick={() => send({ cmd: "previous" })} className="grid size-9 place-items-center rounded-full hover:bg-rule/60">
              ⏮
            </button>
            <button
              type="button"
              aria-label={p?.isPlaying ? "השהיה" : "נגינה"}
              onClick={() => (p?.isPlaying ? send({ cmd: "pause" }) : start())}
              className="grid size-10 place-items-center rounded-full bg-ink text-bg"
            >
              {p?.isPlaying ? "⏸" : "▶"}
            </button>
            <button type="button" aria-label="הבא" onClick={() => send({ cmd: "next" })} className="grid size-9 place-items-center rounded-full hover:bg-rule/60">
              ⏭
            </button>
          </div>
        </div>
        {sp?.device?.volume != null && (
          <label className="mt-3 flex items-center gap-2 text-xs text-ink-soft">
            <span aria-hidden>🔈</span>
            <input
              type="range"
              min={0}
              max={100}
              defaultValue={sp.device.volume}
              key={sp.device.id}
              onPointerUp={(e) => send({ cmd: "volume", value: Number((e.target as HTMLInputElement).value) })}
              onKeyUp={(e) => send({ cmd: "volume", value: Number((e.target as HTMLInputElement).value) })}
              className="flex-1 accent-[var(--ink)]"
              aria-label="עוצמה"
            />
          </label>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
          {(sp?.devices?.length ?? 0) > 0 && (
            <select
              value={sp?.device?.id ?? ""}
              onChange={(e) => e.target.value && send({ cmd: "transfer", device: e.target.value })}
              className="rounded-md border border-rule bg-surface px-2 py-1"
              aria-label="מכשיר"
            >
              {!sp?.device && <option value="">בחירת מכשיר…</option>}
              {sp?.devices?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.type === "Smartphone" ? "📱" : d.type === "Computer" ? "💻" : "🔊"} {d.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => setPicking((x) => !x)} className="underline underline-offset-4 decoration-rule">
            פלייליסט
          </button>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => {
                setAuto(e.target.checked);
                write("musicAuto", e.target.checked ? "1" : "0");
              }}
            />
            נגינה ועצירה עם הטיימר
          </label>
        </div>
        {picking && <div className="mt-3">{picker}</div>}
        {(err || sp?.error) && <p className="mt-2 text-xs text-red-700">{err ?? sp?.error}</p>}
      </div>
    );
  }

  if (!id && !picking)
    return (
      <div className="mt-5 flex flex-col items-center gap-1.5 text-sm">
        <button type="button" onClick={() => setPicking(true)} className="text-ink-soft underline underline-offset-4 decoration-rule">
          🎧 מוזיקה לריכוז
        </button>
        {sp?.enabled && (
          <a href="/api/spotify/login" className="text-xs text-ink-soft underline underline-offset-4 decoration-rule">
            חיבור Spotify לשליטה מלאה
          </a>
        )}
      </div>
    );
  return (
    <div className="mt-5 w-full max-w-sm">
      {picking || !id ? (
        picker
      ) : (
        <>
          <iframe title="Spotify" src={embedUrl(id)} className="h-20 w-full rounded-xl border-0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />
          <div className="mt-1.5 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink-soft">
            <a href={playlistUrl(id)} target="_blank" rel="noreferrer" className="underline underline-offset-4 decoration-rule">
              פתיחה ב־Spotify
            </a>
            <button type="button" onClick={() => setPicking(true)} className="underline underline-offset-4 decoration-rule">
              פלייליסט אחר
            </button>
            {sp?.enabled && (
              <a href="/api/spotify/login" className="underline underline-offset-4 decoration-rule">
                חיבור לשליטה מלאה
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
