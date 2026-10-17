"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FocusTimer } from "@/components/SessionToggle";
import { Avatar } from "@/components/Avatar";

export interface LiveRow {
  user_id: string;
  name: string;
  avatar_url: string | null;
  avatar_emoji?: string | null;
  avatar_color?: string | null;
  title: string;
  ends_at: string;
}

/** Friends studying right now, with a button to study together (your own timer, same end time). */
export function StudyingNow({ rows }: { rows: LiveRow[] }) {
  const router = useRouter();
  const [join, setJoin] = useState<LiveRow | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, 60_000);
    return () => clearInterval(id);
  }, [router]);
  const live = rows.filter((r) => Date.parse(r.ends_at) > now);
  if (!live.length) return null;
  return (
    <div className="panel flex flex-col gap-2 p-4">
      <h2 className="text-sm font-semibold">לומדים עכשיו 📚</h2>
      {live.map((r) => {
        const left = Math.max(1, Math.round((Date.parse(r.ends_at) - now) / 60_000));
        return (
          <div key={r.user_id} className="flex items-center gap-3">
            <Avatar name={r.name} url={r.avatar_url} emoji={r.avatar_emoji} color={r.avatar_color} size={32} />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">{r.name.split(" ")[0]}</div>
              <div className="truncate text-ink-soft">
                {r.title} · עוד {left} דק׳
              </div>
            </div>
            <button type="button" onClick={() => setJoin(r)} className="rounded-full bg-ink px-3 py-1.5 text-sm text-bg">
              ללמוד ביחד
            </button>
          </div>
        );
      })}
      {join && (
        <FocusTimer
          storageKey={`join:${join.user_id}:${join.ends_at}`}
          title={join.title}
          minutes={Math.max(5, Math.round((Date.parse(join.ends_at) - Date.now()) / 60_000))}
          withUser={join.user_id}
          withName={join.name.split(" ")[0]}
          onClose={() => setJoin(null)}
          onFinish={() => setJoin(null)}
        />
      )}
    </div>
  );
}
