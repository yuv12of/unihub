import Link from "next/link";
import { Icon } from "@/components/Icon";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { meetupHref, type MeetupPhase } from "@/lib/meetup";
import { semester } from "@/lib/semester";
import { duration, range } from "@/lib/time";

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Today, from 30 minutes before a tutorial until an hour after: join, open meetup mode, or wrap up. */
export async function MeetupBanner({
  code,
  short,
  date,
  start,
  end,
  phase,
  nowMin,
}: {
  code: string;
  short: string;
  date: string;
  start: string;
  end: string | null;
  phase: MeetupPhase;
  nowMin: number;
}) {
  let live: string | null = null;
  let open = 0;
  if (supabaseEnabled) {
    const sb = await createClient();
    const [links, stuck] = await Promise.all([
      sb.from("user_courses").select("live_url").match({ course_code: code, semester: semester.semester }).maybeSingle(),
      sb.from("stuck_points").select("id", { count: "exact", head: true }).match({ course_code: code, resolved: false }),
    ]);
    live = links.data?.live_url ?? null;
    open = stuck.count ?? 0;
  }
  const title =
    phase === "soon" ? `המפגש ב${short} מתחיל בעוד ${duration(toMin(start) - nowMin)}` : phase === "live" ? `עכשיו: מפגש ב${short}` : `המפגש ב${short} הסתיים`;
  const sub =
    phase === "after"
      ? "לסכם: הייתי או פספסתי, ומה שלא הובן הופך לנקודת תקיעה."
      : [range(start, end), open ? `${open === 1 ? "שאלה אחת" : `${open} שאלות`} מוכנות למנחה` : "מקום להערות עם סימוני זמן"].join(" · ");
  return (
    <section className="accent-surface rounded-2xl p-5" aria-label="מצב מפגש">
      <p className="text-sm opacity-80">מצב מפגש</p>
      <h2 className="mt-0.5 text-xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm opacity-80">{sub}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {live && phase !== "after" && (
          <a href={live} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--on-accent)] px-4 font-semibold text-[var(--accent-bg)]">
            <Icon name="camera" className="size-5" />
            כניסה לזום
          </a>
        )}
        <Link href={meetupHref(code, date)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-current/40 px-4 font-medium">
          <Icon name="pencil" className="size-4" />
          {phase === "after" ? "לסיכום המפגש" : "מצב מפגש: הערות ושאלות"}
        </Link>
      </div>
    </section>
  );
}
