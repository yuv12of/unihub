import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Book } from "@/lib/books";

/** A recommended video for one chapter (or the whole course), checked to exist on YouTube. */
export interface Video {
  id: string; // YouTube video id
  title: string;
  channel: string;
  lang: "he" | "en";
  minutes: number | null;
  watched: boolean;
}

export interface VideoTopic {
  sort: number;
  topic: string;
  /** the book chapter this topic is, when the book is imported */
  chapter: { href: string; done: boolean; title: string } | null;
  videos: Video[];
}

/** Videos for a course, grouped by chapter, with what I've already watched. */
export async function getCourseVideos(code: string, books: Book[]): Promise<VideoTopic[]> {
  if (!supabaseEnabled) return [];
  const sb = await createClient();
  const [{ data: rows }, { data: seen }] = await Promise.all([
    sb.from("course_videos").select("topic_sort, topic, m, p, sort, video_id, title, channel, lang, minutes").eq("course_code", code).order("topic_sort").order("sort"),
    sb.from("video_watched").select("video_id"),
  ]);
  const watched = new Set((seen ?? []).map((r) => r.video_id as string));
  const mine = books.filter((b) => b.course_code === code).sort((a, b) => a.position - b.position);
  const topics = new Map<number, VideoTopic>();
  for (const r of rows ?? []) {
    let t = topics.get(r.topic_sort);
    if (!t) {
      let chapter: VideoTopic["chapter"] = null;
      if (r.m) {
        try {
          const re = new RegExp(r.m);
          for (const b of mine) {
            const c = b.chapters.find((x) => re.test(x.title));
            if (c) {
              chapter = { href: `/books/${b.id}?ch=${c.idx}${r.p ? `&p=${r.p}` : ""}`, done: !!c.done_at, title: c.title };
              break;
            }
          }
        } catch {}
      }
      t = { sort: r.topic_sort, topic: r.topic, chapter, videos: [] };
      topics.set(r.topic_sort, t);
    }
    t.videos.push({ id: r.video_id, title: r.title, channel: r.channel, lang: r.lang === "en" ? "en" : "he", minutes: r.minutes, watched: watched.has(r.video_id) });
  }
  return [...topics.values()];
}

export const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
