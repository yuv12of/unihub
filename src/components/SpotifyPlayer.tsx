"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { spotifyDo, spotifyNow, spotifyPlaylists, type SpotifyCommand } from "@/app/spotifyActions";
import { FOCUS_PLAYLISTS } from "@/lib/focusMusic";
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

/** Spotify state for a component, refreshed while `active` (and the tab is visible). */
export function useSpotify(active = true, every = 5000) {
  const [sp, setSp] = useState<SpotifyState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => spotifyNow().then(setSp, () => setSp((s) => s ?? { enabled: false, connected: false })), []);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    if (!active || !sp?.connected) return;
    const tick = () => document.visibilityState === "visible" && reload();
    const t = setInterval(tick, every);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, sp?.connected, reload, every]);
  const send = useCallback(
    async (c: SpotifyCommand) => {
      // Optimistic play/pause so the button reacts at once.
      if (c.cmd === "pause" || (c.cmd === "play" && !c.playlist))
        setSp((s) => (s?.playing ? { ...s, playing: { ...s.playing, isPlaying: c.cmd === "play" } } : s));
      const r = await spotifyDo(c);
      setErr(r.ok ? null : (r.error ?? "שגיאה"));
      setTimeout(reload, 700);
      return r.ok;
    },
    [reload],
  );
  /** Start the chosen playlist, or just resume. */
  const start = useCallback(
    (playlist: string | null) => {
      const want = playlist ? `spotify:playlist:${playlist}` : null;
      const device = sp?.device?.id ?? sp?.devices?.[0]?.id;
      if (want && sp?.playing?.context !== want) return send({ cmd: "play", playlist, device });
      return send({ cmd: "play", device: sp?.device ? null : device });
    },
    [sp, send],
  );
  return { sp, err, send, start, reload };
}

export function useChosenPlaylist() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => setId(read("music")), []);
  const choose = (v: string) => {
    setId(v);
    write("music", v);
  };
  return [id, choose] as const;
}

/** Playlist chips: the focus playlists, plus the user's own on request. */
export function PlaylistPicker({ current, onPick, mine = true }: { current: string | null; onPick: (id: string) => void; mine?: boolean }) {
  const [lists, setLists] = useState<{ id: string; name: string }[] | null>(null);
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm hover:border-ink ${on ? "border-ink" : "border-rule"}`;
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {FOCUS_PLAYLISTS.map((p) => (
        <button key={p.id} type="button" onClick={() => onPick(p.id)} className={chip(p.id === current)}>
          {p.emoji} {p.name}
        </button>
      ))}
      {mine &&
        (lists ? (
          lists.map((p) => (
            <button key={p.id} type="button" onClick={() => onPick(p.id)} className={chip(p.id === current)}>
              🎵 {p.name}
            </button>
          ))
        ) : (
          <button type="button" onClick={() => spotifyPlaylists().then(setLists)} className="rounded-full px-3 py-1 text-sm text-ink-soft underline underline-offset-4 decoration-rule">
            הפלייליסטים שלי
          </button>
        ))}
    </div>
  );
}

/** The full player: now playing, prev/play/next, volume, device, playlists. */
export function SpotifyControls({
  sp,
  err,
  send,
  start,
  playlist,
  onPlaylist,
  extra,
}: {
  sp: SpotifyState | null;
  err: string | null;
  send: (c: SpotifyCommand) => Promise<boolean>;
  start: (playlist: string | null) => unknown;
  playlist: string | null;
  onPlaylist: (id: string) => void;
  extra?: React.ReactNode;
}) {
  const [picking, setPicking] = useState(false);
  const p = sp?.playing;
  return (
    <div className="w-full rounded-2xl bg-bg p-3 text-start ring-1 ring-rule">
      <div className="flex items-center gap-3">
        {p?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="grid size-14 shrink-0 place-items-center rounded-lg bg-rule/60 text-2xl">🎧</div>
        )}
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
            onClick={() => (p?.isPlaying ? send({ cmd: "pause" }) : start(p ? null : playlist))}
            className="grid size-10 place-items-center rounded-full bg-ink text-bg"
          >
            {p?.isPlaying ? "⏸" : "▶"}
          </button>
          <button type="button" aria-label="הבא" onClick={() => send({ cmd: "next" })} className="grid size-9 place-items-center rounded-full hover:bg-rule/60">
            ⏭
          </button>
        </div>
      </div>
      {p && p.duration > 0 && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-rule" aria-hidden>
          <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (p.progress / p.duration) * 100)}%` }} />
        </div>
      )}
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
        {sp?.shuffle != null && (
          <button type="button" onClick={() => send({ cmd: "shuffle", value: !sp.shuffle })} className={sp.shuffle ? "text-ink" : ""} aria-pressed={sp.shuffle}>
            🔀 ערבוב
          </button>
        )}
        <button type="button" onClick={() => setPicking((x) => !x)} className="underline underline-offset-4 decoration-rule">
          פלייליסט
        </button>
        {p?.url && (
          <a href={p.url} target="_blank" rel="noreferrer" className="underline underline-offset-4 decoration-rule">
            פתיחה ב־Spotify
          </a>
        )}
        {extra}
      </div>
      {picking && (
        <div className="mt-3">
          <PlaylistPicker
            current={playlist}
            onPick={(id) => {
              onPlaylist(id);
              setPicking(false);
              send({ cmd: "play", playlist: id, device: sp?.device?.id ?? sp?.devices?.[0]?.id });
            }}
          />
        </div>
      )}
      {(err || sp?.error) && <p className="mt-2 text-xs text-red-700">{err ?? sp?.error}</p>}
    </div>
  );
}

/** PC sidebar: a compact now-playing row that opens the full player. */
export function SidebarPlayer() {
  const [open, setOpen] = useState(false);
  const { sp, err, send, start } = useSpotify(true, open ? 5000 : 15000);
  const [playlist, setPlaylist] = useChosenPlaylist();
  if (!sp?.connected) return null;
  const p = sp.playing;
  return (
    <div className="mb-3">
      {open ? (
        <div className="space-y-1">
          <SpotifyControls sp={sp} err={err} send={send} start={start} playlist={playlist} onPlaylist={setPlaylist} />
          <button type="button" onClick={() => setOpen(false)} className="w-full text-center text-xs text-ink-soft hover:text-ink">
            סגירה
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-bg px-2 py-1.5 ring-1 ring-rule">
          <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-2 text-start" aria-label="נגן Spotify">
            {p?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" className="size-8 shrink-0 rounded-md object-cover" />
            ) : (
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-rule/60">🎧</span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{p?.title ?? "Spotify"}</span>
              <span className="block truncate text-[11px] text-ink-soft">{p?.artist ?? "לחצו לבחירת מוזיקה"}</span>
            </span>
          </button>
          <button
            type="button"
            aria-label={p?.isPlaying ? "השהיה" : "נגינה"}
            onClick={() => (p?.isPlaying ? send({ cmd: "pause" }) : start(p ? null : playlist))}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-sm text-bg"
          >
            {p?.isPlaying ? "⏸" : "▶"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Phone header: a music button (pulsing while playing) that opens the player in a bottom sheet. */
export function PhonePlayerButton() {
  const [open, setOpen] = useState(false);
  const { sp, err, send, start } = useSpotify(open, 5000);
  const [playlist, setPlaylist] = useChosenPlaylist();
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    sheet.current?.focus();
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  if (!sp?.connected) return null;
  const playing = !!sp.playing?.isPlaying;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="נגן Spotify"
        className={`grid size-8 place-items-center rounded-full ${playing ? "bg-ink text-bg" : "text-ink-soft"}`}
      >
        <span className={playing ? "motion-safe:animate-pulse" : ""}>🎧</span>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setOpen(false)} role="presentation">
            <div
              ref={sheet}
              tabIndex={-1}
              role="dialog"
              aria-modal
              aria-label="נגן Spotify"
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-rule" aria-hidden />
              <SpotifyControls sp={sp} err={err} send={send} start={start} playlist={playlist} onPlaylist={setPlaylist} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
