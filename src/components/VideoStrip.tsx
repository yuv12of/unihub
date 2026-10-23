"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { setWatched } from "@/app/act";
import { Icon } from "@/components/Icon";
import type { Video } from "@/lib/videos";

const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const len = (m: number | null) => (m == null ? "" : m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} ש׳` : `${m} דק׳`);

/** A swipeable row of videos for one chapter. A tap plays it here; the tick marks it watched. */
export function VideoStrip({ videos }: { videos: Video[] }) {
  const [list, apply] = useOptimistic(videos, (s, p: { id: string; on: boolean }) => s.map((v) => (v.id === p.id ? { ...v, watched: p.on } : v)));
  const [, start] = useTransition();
  const [playing, setPlaying] = useState<Video | null>(null);
  const toggle = (v: Video, on = !v.watched) =>
    start(async () => {
      apply({ id: v.id, on });
      await setWatched(v.id, on);
    });

  return (
    <>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        {list.map((v) => (
          <li key={v.id} className="w-56 shrink-0 snap-start">
            <button type="button" onClick={() => setPlaying(v)} className="group block w-full text-start" aria-label={`ניגון: ${v.title}`}>
              <span className="relative block aspect-video overflow-hidden rounded-lg bg-rule">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumb(v.id)} alt="" loading="lazy" className={`size-full object-cover transition ${v.watched ? "opacity-50 grayscale" : "group-hover:scale-[1.03]"}`} />
                <span className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
                  <span className="grid size-11 place-items-center rounded-full bg-black/65 text-white">
                    <Icon name="play" className="size-5" />
                  </span>
                </span>
                {v.minutes != null && <span className="absolute bottom-1.5 end-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] tabular-nums text-white">{len(v.minutes)}</span>}
                {v.lang === "en" && <span className="absolute top-1.5 start-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">EN</span>}
              </span>
              <span className={`mt-1.5 line-clamp-2 text-sm leading-snug ${v.watched ? "text-ink-soft" : "font-medium"}`} dir="auto">
                {v.title}
              </span>
            </button>
            <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-ink-soft">
              <span className="truncate">{v.channel}</span>
              <button
                type="button"
                onClick={() => toggle(v)}
                aria-pressed={v.watched}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 ${v.watched ? "border-ink text-ink" : "border-rule hover:border-ink"}`}
              >
                {v.watched && <Icon name="check" className="size-3" />}
                {v.watched ? "נצפה" : "סימון כנצפה"}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {playing && (
        <Player
          v={list.find((x) => x.id === playing.id) ?? playing}
          onClose={() => setPlaying(null)}
          onWatched={(v) => toggle(v, true)}
        />
      )}
    </>
  );
}

function Player({ v, onClose, onWatched }: { v: Video; onClose: () => void; onWatched: (v: Video) => void }) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3 sm:p-8" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={v.title} className="w-full max-w-4xl overflow-hidden rounded-xl bg-surface">
        <div className="aspect-video bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0`}
            title={v.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="size-full"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium" dir="auto">
              {v.title}
            </p>
            <p className="text-sm text-ink-soft">{v.channel}</p>
          </div>
          {!v.watched && (
            <button type="button" onClick={() => onWatched(v)} className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-bg">
              <Icon name="check" className="size-4" />
              סימון כנצפה
            </button>
          )}
          <a href={watchUrl(v.id)} target="_blank" rel="noreferrer" className="text-sm text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
            פתיחה ב־YouTube
          </a>
          <button type="button" onClick={onClose} aria-label="סגירה" className="rounded-lg p-2 text-ink-soft hover:bg-bg hover:text-ink">
            <Icon name="close" className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
