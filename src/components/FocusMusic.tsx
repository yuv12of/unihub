"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { spotifyDo } from "@/app/spotifyActions";
import { embedUrl, playlistUrl } from "@/lib/focusMusic";
import { PlaylistPicker, SpotifyControls, useChosenPlaylist, useSpotify } from "@/components/SpotifyPlayer";
import { Icon } from "@/components/Icon";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

/**
 * Music inside the focus timer. With Spotify connected: the full player, and (optionally) the music
 * starts with the timer, pauses with it and stops when the session ends. Without: the embedded player.
 */
export function FocusMusic({ running, over, className = "mt-5 w-full max-w-sm" }: { running: boolean; over: boolean; className?: string }) {
  const [id, setId] = useChosenPlaylist();
  const [auto, setAuto] = useState(true);
  const [picking, setPicking] = useState(false);
  const { sp, err, send, start } = useSpotify(true, 5000);
  useEffect(() => setAuto(read("musicAuto") !== "0"), []);
  const connected = !!sp?.connected;

  const live = useRef({ sp, id, auto, start });
  live.current = { sp, id, auto, start };
  const begin = useCallback(() => live.current.start(live.current.id), []);

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
      if (running && !live.current.sp?.playing?.isPlaying) begin();
    } else if (running !== prev.running) {
      if (running) begin();
      else send({ cmd: "pause" });
    }
  }, [connected, auto, running, over, begin, send]);
  useEffect(
    () => () => {
      if (live.current.sp?.connected && live.current.auto && live.current.sp.playing?.isPlaying) spotifyDo({ cmd: "pause" }).catch(() => {});
    },
    [],
  );

  if (connected)
    return (
      <div className={className}>
        <SpotifyControls
          sp={sp}
          err={err}
          send={send}
          start={start}
          playlist={id}
          onPlaylist={setId}
          extra={
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => {
                  setAuto(e.target.checked);
                  try {
                    localStorage.setItem("musicAuto", e.target.checked ? "1" : "0");
                  } catch {}
                }}
              />
              נגינה ועצירה עם הטיימר
            </label>
          }
        />
      </div>
    );

  const choose = (v: string) => {
    setId(v);
    setPicking(false);
  };
  if (!id && !picking)
    return (
      <div className={`flex flex-col items-center gap-1.5 text-sm ${className}`}>
        <button type="button" onClick={() => setPicking(true)} className="text-ink-soft underline underline-offset-4 decoration-rule">
          <Icon name="headphones" className="me-1 size-4" />
          מוזיקה לריכוז
        </button>
        {sp?.enabled && (
          <a href="/api/spotify/login" className="text-xs text-ink-soft underline underline-offset-4 decoration-rule">
            חיבור Spotify לשליטה מלאה
          </a>
        )}
      </div>
    );
  return (
    <div className={className}>
      {picking || !id ? (
        <PlaylistPicker current={id} onPick={choose} mine={false} />
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
