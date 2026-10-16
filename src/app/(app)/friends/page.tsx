import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getFollowRequests, getFriendView, getMyStudyDays, getNames, getNotifications, getPeople, getShare, getUserId } from "@/lib/userdata";
import { Heatmap } from "@/components/Heatmap";
import { CheerButtons, GroupFinder, NotificationsList } from "@/components/SocialBits";
import { weekStart } from "@/lib/routines";
import { summarize } from "@/lib/friends";
import { todayInIsrael } from "@/lib/semester";
import { minutesLabel } from "@/lib/planner";
import { Avatar } from "@/components/Avatar";
import { FollowRequest, FriendsSearch, PersonActions, ShareSettingsForm } from "@/components/FriendsParts";

export default function FriendsPage() {
  return (
    <>
      <h1 className="font-display text-4xl">חברים</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        עוקבים אחרי חברים ומשפחה כדי לראות איך הם מתקדמים, ומזמינים אותם לאירועים ולשגרה משותפת. כל אחד מחליט מה הוא משתף.
      </p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Friends />
      </Suspense>
    </>
  );
}

async function Friends() {
  await connection();
  const today = todayInIsrael();
  const [people, requests, share, notes, myDays, me] = await Promise.all([
    getPeople(),
    getFollowRequests(),
    getShare(),
    getNotifications(15),
    getMyStudyDays(),
    getUserId(),
  ]);
  const requesters = await getNames(requests);
  const following = people.filter((p) => p.i_follow === "accepted");
  const views = await Promise.all(following.map((p) => getFriendView(p.id)));
  const others = people.filter((p) => p.i_follow !== "accepted");
  const ws = weekStart(today);
  const myWeek = Object.entries(myDays).filter(([d]) => d >= ws && d <= today).reduce((n, [, m]) => n + m, 0);
  const league = [
    { id: me ?? "me", name: "אני", avatar_url: null as string | null, minutes: myWeek, mine: true },
    ...following.flatMap((p, i) => {
      const v = views[i];
      return v?.share.study ? [{ id: p.id, name: p.name, avatar_url: p.avatar_url, minutes: summarize(v, today).week, mine: false }] : [];
    }),
  ].sort((a, b) => b.minutes - a.minutes);
  const connected = people.filter((p) => p.i_follow === "accepted" || p.follows_me === "accepted");

  return (
    <div className="mt-6 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-8">
        <NotificationsList items={notes} />

        {requests.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">בקשות מעקב</h2>
            <ul className="panel divide-y divide-rule">
              {requests.map((id) => (
                <FollowRequest
                  key={id}
                  id={id}
                  name={requesters[id]?.name ?? "?"}
                  avatar={requesters[id]?.avatar_url ?? null}
                  iFollow={people.find((p) => p.id === id)?.i_follow ?? null}
                />
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold">אחרי מי אני עוקב/ת</h2>
          {following.length === 0 ? (
            <p className="panel p-5 text-ink-soft">עוד לא. חפשו חברים לפי שם או מייל (מימין), ושלחו בקשת מעקב.</p>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {following.map((p, i) => {
                const v = views[i];
                const s = v ? summarize(v, today) : null;
                return (
                  <li key={p.id} className="panel p-4">
                    <Link href={`/friends/${p.id}`} className="flex items-center gap-3">
                      <Avatar name={p.name} url={p.avatar_url} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-sm text-ink-soft">
                          {s && v?.share.study ? `השבוע: ${minutesLabel(s.week)} לימוד` : "לא משתף/ת שעות לימוד"}
                        </div>
                      </div>
                      <span className="text-ink-soft" aria-hidden>
                        ←
                      </span>
                    </Link>
                    {s && s.courses.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {s.courses.map(({ course, st }) => (
                          <li key={course.code}>
                            <div className="flex justify-between text-sm">
                              <span className="truncate">{course.name}</span>
                              {v?.share.progress && (
                                <span className="shrink-0 tabular-nums text-ink-soft">
                                  {st.earned}/{course.assignmentWeight.min}
                                  {st.average != null ? ` · ממוצע ${st.average}` : ""}
                                </span>
                              )}
                            </div>
                            {v?.share.progress && (
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-rule">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${Math.min(100, (st.earned / Math.max(1, course.assignmentWeight.min)) * 100)}%`, background: course.color }}
                                />
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-xs text-ink-soft">לפרגן:</span>
                      <CheerButtons to={p.id} label={s && s.week ? `על ${minutesLabel(s.week)} לימוד השבוע` : "סתם כי"} />
                    </div>
                    {s && s.routines.some((r) => r.streak.count > 1) && (
                      <p className="mt-3 text-sm text-ink-soft">
                        {s.routines
                          .filter((r) => r.streak.count > 1)
                          .slice(0, 3)
                          .map((r) => `🔥 ${r.routine.title} ${r.streak.count} ${r.streak.unit === "days" ? "ימים" : "שבועות"}`)
                          .join(" · ")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {others.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">עוד אנשים</h2>
            <ul className="panel divide-y divide-rule">
              {others.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={p.name} url={p.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-ink-soft">
                      {p.follows_me === "accepted" ? "עוקב/ת אחריך" : p.follows_me === "pending" ? "ביקש/ה לעקוב" : ""}
                      {p.i_follow === "pending" ? " · הבקשה שלך ממתינה" : ""}
                    </div>
                  </div>
                  <PersonActions id={p.id} iFollow={p.i_follow ?? null} followsMe={p.follows_me ?? null} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="space-y-6">
        {league.length > 1 && (
          <section className="panel p-5">
            <h2 className="font-semibold">הליגה השבועית</h2>
            <p className="mt-1 text-xs text-ink-soft">שעות לימוד מיום ראשון, מבין מי שמשתף שעות לימוד.</p>
            <ol className="mt-3 space-y-2">
              {league.map((r, i) => (
                <li key={r.id} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${r.mine ? "bg-highlight/30" : ""}`}>
                  <span className="w-5 text-center font-display text-lg tabular-nums">{i === 0 && r.minutes > 0 ? "🏆" : i + 1}</span>
                  <Avatar name={r.name} url={r.avatar_url} size={26} />
                  <span className="min-w-0 flex-1 truncate text-sm">{r.mine ? "אני" : r.name.split(" ")[0]}</span>
                  <span className="text-sm tabular-nums text-ink-soft">{minutesLabel(r.minutes)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        <section className="panel p-5">
          <h2 className="font-semibold">הלימוד שלי</h2>
          <div className="mt-3 overflow-x-auto">
            <Heatmap days={myDays} today={today} />
          </div>
        </section>
        <GroupFinder
          people={connected.map((p) => {
            const i = following.findIndex((f) => f.id === p.id);
            return { id: p.id, name: p.name, shares: i >= 0 && !!views[i] && views[i]!.schedule !== "none" };
          })}
        />
        <section className="panel p-5">
          <h2 className="font-semibold">חיפוש</h2>
          <FriendsSearch />
        </section>
        {share && (
          <section className="panel p-5">
            <h2 className="font-semibold">מה אני משתף/ת</h2>
            <p className="mt-1 text-sm text-ink-soft">רק מי שאישרת שיעקוב אחריך רואה את זה.</p>
            <ShareSettingsForm initial={share.share} />
          </section>
        )}
      </aside>
    </div>
  );
}
