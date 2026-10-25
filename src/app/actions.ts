"use server";

import type { RoutineOverride } from "@/lib/routines";
import { SLEEP_IN_TITLE } from "@/lib/sleepIn";
import { cleanRepeat, daysBetween, repeatDates, type Repeat } from "@/lib/repeat";
import { refresh } from "next/cache";
import { after } from "next/server";
import { deliverNotifications } from "@/lib/push";
import { action, must, type ActionCtx } from "@/app/guard";
import { semester } from "@/lib/semester";
import type { Status } from "@/lib/progress";

const STATUSES: Status[] = ["todo", "in_progress", "submitted", "skipped"];

export async function saveProgress(input: {
  code: string;
  n: string;
  status: Status;
  grade?: number | null;
}) {
  return action("saveProgress", async ({ supabase, userId }) => {

    const { data: known } = await supabase
      .from("user_courses")
      .select("course_code, course:courses(assignments(n))")
      .match({ course_code: input.code, semester: semester.semester })
      .maybeSingle();
    const ns = ((known?.course as unknown as { assignments: { n: string }[] } | null)?.assignments ?? []).map((a) => a.n);
    if (!ns.includes(input.n)) throw new Error("המטלה לא נמצאה בקורס");
    if (!STATUSES.includes(input.status)) throw new Error("מצב לא תקין");
    const grade =
      input.grade == null || Number.isNaN(input.grade) ? null : Math.max(0, Math.min(100, Math.round(input.grade)));

    const { error } = await supabase.from("assignment_progress").upsert({
      user_id: userId,
      course_code: input.code,
      semester: semester.semester,
      n: input.n,
      status: input.status,
      grade: input.status === "submitted" ? grade : null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    refresh();
  });
}


const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** A real calendar date in YYYY-MM-DD (rejects 2027-02-31). */
const DATE = {
  test(v: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  },
};

export async function savePrefs(formData: FormData) {
  return action("savePrefs", async ({ supabase, userId }) => {
    const availability: Record<string, { start: string; minutes: number }> = {};
    for (let d = 0; d < 7; d++) {
      const start = String(formData.get(`start-${d}`) ?? "18:00");
      // The form sends an end time ("עד"); older forms sent a length in minutes.
      const end = String(formData.get(`end-${d}`) ?? "");
      const [sh, sm] = start.split(":").map(Number);
      const fromEnd = TIME.test(end) ? Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5)) - (sh * 60 + sm) : NaN;
      const raw = Number.isFinite(fromEnd) ? fromEnd : Number(formData.get(`minutes-${d}`) ?? 0);
      const minutes = formData.get(`on-${d}`) ? raw : 0;
      if (!TIME.test(start) || !Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) throw new Error("שעות הלימוד לא תקינות: שעת הסיום צריכה להיות אחרי שעת ההתחלה");
      // A window can't run past midnight (the planner would date those sessions wrongly).
      const [h, m] = start.split(":").map(Number);
      availability[String(d)] = { start, minutes: Math.min(minutes, 24 * 60 - 1 - (h * 60 + m)) };
    }
    const session = Number(formData.get("session_minutes"));
    if (!Number.isFinite(session) || session < 30 || session > 240) throw new Error("אורך מפגש לימוד: בין 30 ל־240 דקות");
    const { error } = await supabase.from("study_prefs").upsert({
      user_id: userId,
      availability,
      session_minutes: session,
      fill_routine: formData.get("fill_routine") === "on",
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function saveExams(formData: FormData) {
  return action("saveExams", async ({ supabase, userId }) => {
    const { getCourses } = await import("@/lib/userdata");
    for (const c of await getCourses()) {
      for (const moed of ["א", "ב"]) {
        const date = String(formData.get(`date-${c.code}-${moed}`) ?? "");
        const time = String(formData.get(`time-${c.code}-${moed}`) ?? "");
        const key = { user_id: userId, course_code: c.code, semester: semester.semester, moed };
        if (!date) {
          must(await supabase.from("exams").delete().match(key));
          continue;
        }
        if (!DATE.test(date) || (time && !TIME.test(time))) throw new Error("תאריך או שעת מבחן לא תקינים");
        const { error } = await supabase.from("exams").upsert({ ...key, date, start_time: time || null });
        if (error) throw new Error(error.message);
      }
    }
    refresh();
  });
}

/** Creates the private calendar link, or replaces it (the old link stops working). */
export async function resetFeed() {
  return action("resetFeed", async ({ supabase, userId }) => {
    must(await supabase.from("calendar_feeds").delete().eq("user_id", userId));
    const { error } = await supabase.from("calendar_feeds").insert({ user_id: userId });
    if (error) throw new Error(error.message);
    refresh();
  });
}

/** minutes: how long was actually studied (credited by the planner so the remaining work shrinks). */
export async function setSessionStatus(key: string, status: "done" | "skipped" | null, minutes?: number) {
  return action("setSessionStatus", async ({ supabase, userId }) => {
    if (key.length > 300) throw new Error("מפגש לא תקין");
    if (status !== null && status !== "done" && status !== "skipped") throw new Error("מצב לא תקין");
    if (status === null) {
      must(await supabase.from("session_status").delete().match({ user_id: userId, session_key: key }));
    } else {
      const m = status === "done" && minutes != null && Number.isFinite(minutes) ? Math.max(0, Math.min(600, Math.round(minutes))) : null;
      const { error } = await supabase
        .from("session_status")
        .upsert({ user_id: userId, session_key: key, status, minutes: m, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    }
    refresh();
  });
}

type EventTimes = {
  allDay?: boolean;
  start?: string | null;
  end?: string | null;
};

/** Times of an event: both null for all-day, else a valid start < end. */
function eventTimes(t: EventTimes): {
  start_time: string | null;
  end_time: string | null;
} {
  if (t.allDay) return { start_time: null, end_time: null };
  if (
    !t.start ||
    !t.end ||
    !TIME.test(t.start) ||
    !TIME.test(t.end) ||
    t.end <= t.start
  )
    throw new Error("שעות לא תקינות");
  return { start_time: t.start, end_time: t.end };
}
const eventTitle = (raw: string) => {
  const title = raw.trim();
  if (!title || title.length > 200) throw new Error("חסר שם לאירוע");
  return title;
};

export async function addEvent(input: {
  date: string;
  start?: string | null;
  end?: string | null;
  allDay?: boolean;
  title: string;
  location?: string;
  blocks?: boolean;
  repeat?: Repeat | null;
  invite?: string[];
}) {
  notifyNow();
  return action("addEvent", async ({ supabase, userId }) => {
    if (!DATE.test(input.date)) throw new Error("תאריך לא תקין");
    const repeat = cleanRepeat(input.repeat, input.date);
    const seriesId = repeat ? crypto.randomUUID() : null;
    const base = {
      user_id: userId,
      ...eventTimes(input),
      title: eventTitle(input.title),
      location: input.location?.trim().slice(0, 200) || null,
      // "custom" blocks study time (an all-day one blocks the whole day); "other" is shown but the plan can use the time
      kind: input.blocks === false ? "other" : "custom",
      source: "manual",
      series_id: seriesId,
      repeat,
    };
    const dates = repeat ? repeatDates(input.date, repeat) : [input.date];
    const rows = dates.map((date) => ({
      ...base,
      id: crypto.randomUUID(),
      date,
    }));
    const { error } = await supabase.from("user_events").insert(rows);
    if (error) throw new Error(error.message);
    if (input.invite?.length)
      for (let i = 0; i < rows.length; i += 20)
        await Promise.all(
          rows
            .slice(i, i + 20)
            .map((r) =>
              supabase.rpc("invite_to_event", {
                p_event: r.id,
                p_users: input.invite,
              }),
            ),
        );
    refresh();
  });
}

/**
 * Move, resize or edit one of my own events (the calendar's drag and edit). Synced events stay read-only.
 * In a series, scope says which dates change: this one, this and the following ones, or all of them.
 * A single event given a repeat rule becomes the first date of a new series.
 */
export async function updateEvent(input: {
  id: string;
  date?: string;
  start?: string | null;
  end?: string | null;
  allDay?: boolean;
  title?: string;
  location?: string | null;
  blocks?: boolean;
  repeat?: Repeat | null;
  scope?: "this" | "following" | "all";
}) {
  notifyNow();
  return action("updateEvent", async ({ supabase, userId }) => {
    const own = { user_id: userId, source: "manual" };
    const { data: ev } = await supabase
      .from("user_events")
      .select("date, start_time, end_time, title, location, kind, series_id")
      .match({ id: input.id, ...own })
      .maybeSingle();
    if (!ev) throw new Error("אפשר לערוך רק אירועים שהוספת בעצמך");
    const date = input.date ?? ev.date;
    if (!DATE.test(date)) throw new Error("תאריך לא תקין");
    const allDay = input.allDay ?? (input.start === undefined && !ev.start_time);
    const fields: Record<string, unknown> = eventTimes({
      allDay,
      start: input.start ?? ev.start_time,
      end: input.end ?? ev.end_time,
    });
    if (input.title !== undefined) fields.title = eventTitle(input.title);
    if (input.location !== undefined)
      fields.location = input.location?.trim().slice(0, 200) || null;
    if (input.blocks !== undefined)
      fields.kind = input.blocks ? "custom" : "other";

    const scope = ev.series_id ? (input.scope ?? "this") : "this";
    if (scope === "this") {
      const repeat = !ev.series_id ? cleanRepeat(input.repeat, date) : null;
      const seriesId = repeat ? crypto.randomUUID() : ev.series_id;
      const { error } = await supabase
        .from("user_events")
        .update({
          ...fields,
          date,
          ...(repeat && { series_id: seriesId, repeat }),
        })
        .match({ id: input.id, ...own });
      if (error) throw new Error(error.message);
      if (repeat) {
        const next = repeatDates(date, repeat).slice(1);
        const { data: cur } = await supabase
          .from("user_events")
          .select("title, location, kind, start_time, end_time")
          .eq("id", input.id)
          .single();
        const rows = next.map((d) => ({
          ...cur,
          ...own,
          id: crypto.randomUUID(),
          date: d,
          series_id: seriesId,
          repeat,
        }));
        if (rows.length) {
          const { error: e2 } = await supabase.from("user_events").insert(rows);
          if (e2) throw new Error(e2.message);
        }
      }
    } else {
      // A whole series (or its tail): same times and details, dates shifted by the same number of days.
      let q = supabase
        .from("user_events")
        .select("id, date")
        .match({ series_id: ev.series_id, ...own });
      if (scope === "following") q = q.gte("date", ev.date);
      const { data: rows } = await q;
      const shift = daysBetween(ev.date, date);
      if (shift === 0) {
        let u = supabase
          .from("user_events")
          .update(fields)
          .match({ series_id: ev.series_id, ...own });
        if (scope === "following") u = u.gte("date", ev.date);
        const { error } = await u;
        if (error) throw new Error(error.message);
      } else {
        const shifted = (rows ?? []).map((r) => {
          const d = new Date(r.date + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + shift);
          return { id: r.id, date: d.toISOString().slice(0, 10) };
        });
        for (let i = 0; i < shifted.length; i += 25) {
          const res = await Promise.all(
            shifted.slice(i, i + 25).map((r) =>
              supabase
                .from("user_events")
                .update({ ...fields, date: r.date })
                .match({ id: r.id, ...own }),
            ),
          );
          const bad = res.find((r) => r.error);
          if (bad?.error) throw new Error(bad.error.message);
        }
      }
    }
    refresh();
  });
}

/** Deletes one of my events; in a series, just this date, this and the following ones, or all. */
export async function deleteEvent(
  id: string,
  scope: "this" | "following" | "all" = "this",
) {
  return action("deleteEvent", async ({ supabase, userId }) => {
    const own = { user_id: userId, source: "manual" };
    const { data: ev } = await supabase
      .from("user_events")
      .select("date, series_id")
      .match({ id, ...own })
      .maybeSingle();
    if (!ev) return;
    if (scope === "this" || !ev.series_id) {
      const { error } = await supabase
        .from("user_events")
        .delete()
        .match({ id, ...own });
      if (error) throw new Error(error.message);
    } else {
      let q = supabase
        .from("user_events")
        .delete()
        .match({ series_id: ev.series_id, ...own });
      if (scope === "following") q = q.gte("date", ev.date);
      const { error } = await q;
      if (error) throw new Error(error.message);
    }
    refresh();
  });
}

/** Accept or cancel tomorrow's sleep-in (an event over the first hour of the morning). */
export async function setSleepIn(date: string, from: string | null, until: string | null) {
  notifyNow();
  return action("setSleepIn", async ({ supabase, userId }) => {
    if (!DATE.test(date)) throw new Error("תאריך לא תקין");
    must(await supabase.from("user_events").delete().match({ user_id: userId, date, title: SLEEP_IN_TITLE, source: "manual" }));
    if (from && until) {
      if (!TIME.test(from) || !TIME.test(until) || until <= from) throw new Error("שעות לא תקינות");
      const { error } = await supabase
        .from("user_events")
        .insert({ user_id: userId, date, start_time: from, end_time: until, title: SLEEP_IN_TITLE, kind: "custom", source: "manual" });
      if (error) throw new Error(error.message);
    }
    refresh();
  });
}

export async function markMailRead(id: string, read = true) {
  return action("markMailRead", async ({ supabase, userId }) => {
    must(await supabase.from("mails").update({ is_read: read }).match({ id, user_id: userId }));
    refresh();
  });
}

/** Creates (or replaces) the token the Gmail Apps Script uses to deliver university mail. */
export async function resetIngestToken() {
  return action("resetIngestToken", async ({ supabase, userId }) => {
    must(await supabase.from("ingest_tokens").delete().eq("user_id", userId));
    const { error } = await supabase.from("ingest_tokens").insert({ user_id: userId });
    if (error) throw new Error(error.message);
    refresh();
  });
}

/** Returns the app's public push key, generating the key pair once if it doesn't exist yet. */
export async function ensurePushKey() {
  return action("ensurePushKey", async ({ supabase }) => {
    const { data: existing } = await supabase.rpc("vapid_public");
    if (existing) return existing as string;
    const webpush = (await import("web-push")).default;
    const keys = webpush.generateVAPIDKeys();
    const { data, error } = await supabase.rpc("vapid_init", { p_public: keys.publicKey, p_private: keys.privateKey });
    if (error) throw new Error(error.message);
    return data as string;
  });
}

export async function savePushSubscription(sub: { endpoint: string; p256dh: string; auth: string }) {
  return action("savePushSubscription", async ({ supabase, userId }) => {
    if (!/^https:\/\//.test(sub.endpoint)) throw new Error("כתובת התראות לא תקינה");
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({ user_id: userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, { onConflict: "endpoint" });
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function removePushSubscription(endpoint: string) {
  return action("removePushSubscription", async ({ supabase, userId }) => {
    must(await supabase.from("push_subscriptions").delete().match({ user_id: userId, endpoint }));
    refresh();
  });
}

/** Sends a test notification to all of the user's devices. */
export async function sendTestPush() {
  return action("sendTestPush", async ({ supabase, userId }) => {
    const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
    const { sendPushAsServer, sendPush } = await import("@/lib/push");
    const item = { key: `test|${Date.now()}`, title: "Unihub", body: "ההתראות עובדות. נתראה במפגש הלימוד הבא.", url: "/" };
    // Server key when available (works for everyone); otherwise through the user's Google script token.
    const viaServer = await sendPushAsServer(userId, subs ?? [], [item]);
    if (viaServer) return viaServer;
    const { data: tok } = await supabase.from("ingest_tokens").select("token").maybeSingle();
    if (!tok?.token) throw new Error("ההתראות יעבדו אחרי שמנהל האתר ישלים את ההגדרה בשרת");
    return sendPush(tok.token, subs ?? [], [item]);
  });
}

/** Spaced repetition (SM-2, simplified). grade: 0 again, 1 hard, 2 good, 3 easy. */
export async function reviewCard(id: string, grade: 0 | 1 | 2 | 3) {
  return action("reviewCard", async ({ supabase, userId }) => {
    if (![0, 1, 2, 3].includes(grade)) throw new Error("דירוג לא תקין");
    const { data: c } = await supabase
      .from("cards")
      .select("interval_days, ease, reps, lapses")
      .match({ id, user_id: userId })
      .maybeSingle();
    if (!c) throw new Error("הכרטיס לא נמצא");
    let { interval_days: interval, ease, reps, lapses } = c;
    if (grade === 0) {
      lapses += 1;
      reps = 0;
      interval = 0;
      ease = Math.max(1.3, ease - 0.2);
    } else {
      reps += 1;
      ease = Math.max(1.3, ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
      interval = reps === 1 ? (grade === 3 ? 3 : 1) : reps === 2 ? (grade === 1 ? 3 : 6) : Math.round(interval * ease * (grade === 1 ? 0.8 : grade === 3 ? 1.3 : 1));
    }
    const due = new Date(Date.now() + (interval === 0 ? 10 * 60_000 : interval * 86_400_000));
    must(
      await supabase
        .from("cards")
        .update({ interval_days: interval, ease, reps, lapses, due_at: due.toISOString() })
        .match({ id, user_id: userId }),
    );
  });
}

/** Applies a suggested update from mail (grade, moved tutorial …). */
export async function applyUpdate(id: string) {
  return action("applyUpdate", async ({ supabase }) => {
    const { error } = await supabase.rpc("apply_update", { p_id: id });
    if (error) throw new Error(error.message);
    refresh();
  });
}

/** Hides an update (an applied one stays applied). */
export async function dismissUpdate(id: string) {
  return action("dismissUpdate", async ({ supabase, userId }) => {
    must(await supabase.from("updates").update({ status: "dismissed" }).match({ id, user_id: userId }));
    refresh();
  });
}

/** Saves (or removes, when empty) the private Opal calendar export link. */
export async function saveOpalFeed(formData: FormData) {
  return action("saveOpalFeed", async ({ supabase, userId }) => {
    const url = String(formData.get("url") ?? "").trim();
    if (!url) {
      must(await supabase.from("external_feeds").delete().match({ user_id: userId, kind: "opal" }));
      must(await supabase.from("user_events").delete().match({ user_id: userId, source: "opal" }));
      refresh();
      return;
    }
    const { isOpalExportUrl } = await import("@/lib/icsParse");
    if (!isOpalExportUrl(url)) throw new Error("זה לא קישור יצוא של לוח השנה באופל");
    const { error } = await supabase
      .from("external_feeds")
      .upsert({ user_id: userId, kind: "opal", url, last_status: "ממתין לסנכרון הראשון", last_synced_at: null });
    if (error) throw new Error(error.message);
    refresh();
  });
}

/** Runs the Opal sync right away (instead of waiting for the hourly run). */
export async function syncOpalNow() {
  return action("syncOpalNow", async ({ supabase }) => {
    const { data: tok } = await supabase.from("ingest_tokens").select("token").maybeSingle();
    if (!tok?.token) throw new Error("חסר חיבור לסקריפט Google");
    const { headers } = await import("next/headers");
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    const res = await fetch(`${origin}/api/sync`, { method: "POST", headers: { Authorization: `Bearer ${tok.token}` } });
    refresh();
    return (await res.json()) as { opal: string; events?: number; message?: string };
  });
}

/** Saves (or removes, when empty) the Google Calendar secret iCal address, then imports it right away. */
export async function saveGoogleFeed(url: string) {
  return action("saveGoogleFeed", async ({ supabase, userId }) => {
    url = url.trim();
    if (!url) {
      must(await supabase.from("external_feeds").delete().match({ user_id: userId, kind: "google" }));
      must(await supabase.from("user_events").delete().match({ user_id: userId, source: "google" }));
      refresh();
      return { ok: true as boolean, count: 0, message: undefined as string | undefined };
    }
    const { isGoogleIcsUrl, syncGoogleFor } = await import("@/lib/googleCal");
    if (!isGoogleIcsUrl(url)) throw new Error("זו לא \"הכתובת הסודית בפורמט iCal\" של יומן Google");
    const { error } = await supabase.from("external_feeds").upsert({ user_id: userId, kind: "google", url, last_status: "מסנכרן…", last_synced_at: null });
    if (error) throw new Error(error.message);
    const r = await syncGoogleFor(supabase, userId, url);
    refresh();
    return { ok: r.ok, count: r.count ?? 0, message: r.message };
  });
}

export async function syncGoogleNow() {
  return action("syncGoogleNow", async ({ supabase, userId }) => {
    const { data } = await supabase.from("external_feeds").select("url").match({ user_id: userId, kind: "google" }).maybeSingle();
    if (!data) throw new Error("יומן Google לא מחובר");
    const { syncGoogleFor } = await import("@/lib/googleCal");
    const r = await syncGoogleFor(supabase, userId, data.url);
    refresh();
    return r;
  });
}

/** Hebcal settings: show holidays/Shabbat times, rest mode, city. */
export async function saveJewish(formData: FormData) {
  return action("saveJewish", async ({ supabase, userId }) => {
    const { jewishPrefs } = await import("@/lib/hebcal");
    const jewish = jewishPrefs({
      show: formData.get("show") === "on",
      times: formData.get("times") === "on",
      rest: formData.get("rest") === "on",
      city: String(formData.get("city") ?? ""),
    });
    const { data } = await supabase.from("study_prefs").update({ jewish }).eq("user_id", userId).select("user_id");
    if (!data?.length) {
      const { defaultPrefs } = await import("@/lib/planner");
      const { error } = await supabase.from("study_prefs").insert({ user_id: userId, availability: defaultPrefs.availability, session_minutes: defaultPrefs.session_minutes, fill_routine: defaultPrefs.fill_routine, jewish });
      if (error) throw new Error(error.message);
    }
    refresh();
  });
}

/** The formatted (HTML) version of one message, loaded when it's opened. */
export async function mailHtml(id: string) {
  return action("mailHtml", async ({ supabase }) => {
    const { data } = await supabase.from("mails").select("body_html").eq("id", id).maybeSingle();
    return (data?.body_html as string | null) ?? null;
  });
}

// ---------- Accounts (admin) ----------

export async function setAccountStatus(userId: string, status: "approved" | "blocked" | "pending") {
  return action("setAccountStatus", async ({ supabase, isAdmin }) => {
    if (!isAdmin) throw new Error("רק מנהל יכול לעשות את זה");
    const { error } = await supabase.rpc("admin_set_status", { p_user: userId, p_status: status });
    if (error) throw new Error(error.message);
    refresh();
  });
}

// ---------- Courses ----------

/** Adds a course by its number: reads the official requirements page and stores it for this user. */
export async function addCourse(codeInput: string) {
  return action("addCourse", async ({ supabase, userId }) => {
    const code = codeInput.trim();
    if (!/^\d{5}$/.test(code)) throw new Error("מספר קורס הוא 5 ספרות");
    const { fetchRequirements } = await import("@/lib/courseCatalog");
    let course = null;
    try {
      course = await fetchRequirements(code, semester.semester);
    } catch {
      /* handled below */
    }
    if (!course) throw new Error(`לא מצאתי את קורס ${code} בסמסטר ${semester.semester}`);
    const { error } = await supabase.rpc("catalog_add_course", { p: course });
    if (error) throw new Error(error.message);
    const { PALETTE_KEYS, defaultShort } = await import("@/lib/semester");
    const { data: mine } = await supabase.from("user_courses").select("color").eq("semester", semester.semester);
    const used = new Set((mine ?? []).map((r) => r.color));
    const color = PALETTE_KEYS.find((k) => !used.has(k)) ?? PALETTE_KEYS[(mine?.length ?? 0) % PALETTE_KEYS.length];
    const { error: e2 } = await supabase
      .from("user_courses")
      .upsert({ user_id: userId, course_code: code, semester: semester.semester, color, short: defaultShort(course.name) }, { ignoreDuplicates: true });
    if (e2) throw new Error(e2.message);
    refresh();
    return course.name;
  });
}

export async function removeCourse(code: string) {
  return action("removeCourse", async ({ supabase, userId }) => {
    must(await supabase.from("user_courses").delete().match({ user_id: userId, course_code: code, semester: semester.semester }));
    refresh();
  });
}

export async function updateCourseLook(code: string, look: { color?: string; short?: string }) {
  return action("updateCourseLook", async ({ supabase, userId }) => {
    const { PALETTE } = await import("@/lib/semester");
    const patch: Record<string, string> = {};
    if (look.color && PALETTE[look.color]) patch.color = look.color;
    if (look.short !== undefined) {
      const s = look.short.trim();
      if (!s || s.length > 24) throw new Error("שם קצר: עד 24 תווים");
      patch.short = s;
    }
    must(await supabase.from("user_courses").update(patch).match({ user_id: userId, course_code: code, semester: semester.semester }));
    refresh();
  });
}

// ---------- Routines ----------

export interface RoutineInput {
  id?: string;
  title: string;
  emoji?: string | null;
  category: string;
  mode: "fixed" | "flexible";
  days: number[];
  start_time: string | null;
  minutes: number;
  per_week: number | null;
  time_window: string;
  blocks_study: boolean;
  share_with?: string[];
}

const CATEGORIES = ["sleep", "meal", "sport", "health", "habit", "chore", "hobby", "social", "other"];
const WINDOW_KEYS = ["morning", "noon", "afternoon", "evening", "any"];

export async function saveRoutine(input: RoutineInput) {
  notifyNow();
  return action("saveRoutine", async ({ supabase, userId }) => {
    const title = input.title.trim();
    if (!title || title.length > 120) throw new Error("חסר שם");
    if (!CATEGORIES.includes(input.category) || !WINDOW_KEYS.includes(input.time_window)) throw new Error("פרטי השגרה לא תקינים");
    const minutes = Math.max(0, Math.min(900, Math.round(input.minutes || 0)));
    const days = [...new Set(input.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    if (input.mode === "fixed" && days.length === 0) throw new Error("בחרו לפחות יום אחד");
    if (input.start_time && !TIME.test(input.start_time)) throw new Error("שעה לא תקינה");
    const row = {
      user_id: userId,
      title,
      emoji: input.emoji?.trim().slice(0, 8) || null,
      category: input.category,
      mode: input.mode,
      days: input.mode === "fixed" ? days : [],
      start_time: input.mode === "fixed" && minutes > 0 ? input.start_time || null : null,
      minutes,
      per_week: input.mode === "flexible" ? Math.max(1, Math.min(14, Math.round(input.per_week ?? 1))) : null,
      time_window: input.time_window,
      blocks_study: input.blocks_study,
    };
    let id = input.id;
    if (id) {
      // Editing keeps a paused routine paused (only a new routine starts active).
      const { error } = await supabase.from("routines").update(row).match({ id, user_id: userId });
      if (error) throw new Error(error.message);
    } else {
      // No "returning": the visibility rule can't see a row inserted in the same statement,
      // so the id is made here and the insert doesn't read the row back.
      id = crypto.randomUUID();
      const { error } = await supabase.from("routines").insert({ ...row, id, active: true });
      if (error) throw new Error(error.message);
    }
    if (input.share_with?.length) await supabase.rpc("share_routine", { p_routine: id, p_users: input.share_with });
    refresh();
  });
}

/**
 * Change one occurrence of my routine (move, resize, skip) or undo that change (ov = null).
 * Old entries (over a month ago) are dropped on the way.
 */
export async function setRoutineOccurrence(id: string, key: string, ov: RoutineOverride | null) {
  notifyNow();
  return action("setRoutineOccurrence", async ({ supabase, userId }) => {
    if (!DATE.test(key)) throw new Error("תאריך לא תקין");
    const { data: r } = await supabase.from("routines").select("overrides, mode").match({ id, user_id: userId }).maybeSingle();
    if (!r) throw new Error("אפשר לשנות רק שגרות שלך");
    let clean: RoutineOverride | null = null;
    if (ov) {
      clean = {};
      if (ov.skip) clean.skip = true;
      else {
        if (ov.start !== undefined) {
          if (ov.start !== null && !TIME.test(ov.start)) throw new Error("שעה לא תקינה");
          clean.start = ov.start;
        }
        if (ov.minutes !== undefined) clean.minutes = Math.max(5, Math.min(900, Math.round(ov.minutes)));
        if (ov.date && ov.date !== key) {
          if (!DATE.test(ov.date) || Math.abs(daysBetween(key, ov.date)) > 6) throw new Error("אפשר להזיז מופע עד שבוע קדימה או אחורה");
          clean.date = ov.date;
        }
      }
    }
    const cutoff = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
    const next: Record<string, RoutineOverride> = {};
    for (const [k, v] of Object.entries((r.overrides ?? {}) as Record<string, RoutineOverride>)) if (k >= cutoff && k !== key) next[k] = v;
    if (clean) next[key] = clean;
    const { error } = await supabase.from("routines").update({ overrides: next }).match({ id, user_id: userId });
    if (error) throw new Error(error.message);
    refresh();
  });
}

/** Change the routine itself from the calendar: time and length (fixed) or length (flexible). */
export async function setRoutineTiming(id: string, input: { start?: string | null; minutes?: number }, clearKey?: string) {
  notifyNow();
  return action("setRoutineTiming", async ({ supabase, userId }) => {
    const { data: r } = await supabase.from("routines").select("mode, overrides").match({ id, user_id: userId }).maybeSingle();
    if (!r) throw new Error("אפשר לשנות רק שגרות שלך");
    const row: Record<string, unknown> = {};
    if (input.minutes !== undefined) row.minutes = Math.max(0, Math.min(900, Math.round(input.minutes)));
    if (input.start !== undefined && r.mode === "fixed") {
      if (input.start !== null && !TIME.test(input.start)) throw new Error("שעה לא תקינה");
      row.start_time = input.start;
    }
    if (clearKey && r.overrides && clearKey in (r.overrides as object)) {
      const next = { ...(r.overrides as Record<string, RoutineOverride>) };
      delete next[clearKey];
      row.overrides = next;
    }
    const { error } = await supabase.from("routines").update(row).match({ id, user_id: userId });
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function deleteRoutine(id: string) {
  return action("deleteRoutine", async ({ supabase, userId }) => {
    must(await supabase.from("routines").delete().match({ id, user_id: userId }));
    refresh();
  });
}

/** Ticks (or unticks) a routine for a day. */
/** Mark a recommended video as watched (or not). */
export async function setWatched(videoId: string, on: boolean) {
  return action("setWatched", async ({ supabase, userId }) => {
    if (!/^[\w-]{11}$/.test(videoId)) return;
    if (on) await supabase.from("video_watched").upsert({ user_id: userId, video_id: videoId });
    else await supabase.from("video_watched").delete().match({ user_id: userId, video_id: videoId });
  });
}

export async function toggleRoutine(id: string, date: string, done: boolean) {
  notifyNow();
  return action("toggleRoutine", async ({ supabase, userId }) => {
    if (!DATE.test(date)) throw new Error("תאריך לא תקין");
    if (done) {
      const { error } = await supabase.from("routine_logs").upsert({ routine_id: id, user_id: userId, date }, { ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    } else {
      must(await supabase.from("routine_logs").delete().match({ routine_id: id, user_id: userId, date }));
    }
    // A hobby's routine: ticking it logs that practice time (once a day); unticking removes it again.
    const { data: hobby } = await supabase.from("hobbies").select("id").match({ routine_id: id, user_id: userId }).maybeSingle();
    if (hobby) {
      if (done) {
        const { data: had } = await supabase.from("hobby_logs").select("id").match({ hobby_id: hobby.id, date }).limit(1);
        if (!had?.length) {
          const { data: r } = await supabase.from("routines").select("minutes").eq("id", id).single();
          must(await supabase.from("hobby_logs").insert({ user_id: userId, hobby_id: hobby.id, date, minutes: Math.max(5, r?.minutes ?? 30), routine_date: date }));
        }
      } else await supabase.from("hobby_logs").delete().match({ hobby_id: hobby.id, user_id: userId, routine_date: date });
    }
    refresh();
  });
}

export async function shareRoutine(id: string, users: string[]) {
  notifyNow();
  return action("shareRoutine", async ({ supabase }) => {
    const { error } = await supabase.rpc("share_routine", { p_routine: id, p_users: users });
    if (error) throw new Error(error.message);
    refresh();
  });
}

/** Join (or decline) a routine someone shared with me; declining after joining = leaving. */
export async function answerRoutine(id: string, accept: boolean) {
  notifyNow();
  return action("answerRoutine", async ({ supabase }) => {
    const { error } = await supabase.rpc("answer_routine", { p_routine: id, p_accept: accept });
    if (error) throw new Error(error.message);
    refresh();
  });
}

// ---------- Event invitations ----------

export async function answerInvite(eventId: string, status: "accepted" | "declined") {
  notifyNow();
  return action("answerInvite", async ({ supabase }) => {
    const { error } = await supabase.rpc("answer_invite", { p_event: eventId, p_status: status });
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function inviteToEvent(eventId: string, users: string[]) {
  notifyNow();
  return action("inviteToEvent", async ({ supabase }) => {
    const { error } = await supabase.rpc("invite_to_event", { p_event: eventId, p_users: users });
    if (error) throw new Error(error.message);
    refresh();
  });
}

// ---------- Friends ----------

export async function searchPeople(query: string) {
  return action("searchPeople", async ({ supabase }) => {
    const q = query.trim();
    if (q.length < 2) return [];
    const { data } = await supabase.rpc("people", { p_query: q });
    return (data ?? []) as { id: string; name: string; avatar_url: string | null; avatar_emoji?: string | null; avatar_color?: string | null; i_follow: string | null; follows_me: string | null }[];
  });
}

export async function followUser(id: string) {
  notifyNow();
  return action("followUser", async ({ supabase }) => {
    const { error } = await supabase.rpc("follow_request", { p_user: id });
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function answerFollow(followerId: string, accept: boolean) {
  notifyNow();
  return action("answerFollow", async ({ supabase }) => {
    const { error } = await supabase.rpc("follow_answer", { p_follower: followerId, p_accept: accept });
    if (error) throw new Error(error.message);
    refresh();
  });
}

/** Stop following someone (or cancel a pending request). */
export async function unfollow(id: string) {
  return action("unfollow", async ({ supabase, userId }) => {
    must(await supabase.from("follows").delete().match({ follower: userId, followee: id }));
    refresh();
  });
}

/** Remove someone who follows me. */
export async function removeFollower(id: string) {
  return action("removeFollower", async ({ supabase, userId }) => {
    must(await supabase.from("follows").delete().match({ follower: id, followee: userId }));
    refresh();
  });
}

export interface ShareSettings {
  courses: boolean;
  progress: boolean;
  grades: boolean;
  study: boolean;
  schedule: "none" | "busy" | "details";
  routines: boolean;
}

export async function saveShare(share: ShareSettings) {
  return action("saveShare", async ({ supabase, userId }) => {
    const clean: ShareSettings = {
      courses: !!share.courses,
      progress: !!share.progress && !!share.courses,
      grades: !!share.grades && !!share.progress && !!share.courses,
      study: !!share.study,
      schedule: ["none", "busy", "details"].includes(share.schedule) ? share.schedule : "busy",
      routines: !!share.routines,
    };
    const { error } = await supabase.from("profiles").update({ share: clean }).eq("id", userId);
    if (error) throw new Error(error.message);
    refresh();
  });
}

/** Pushes any notifications this action created, right after the response is sent. */
function notifyNow() {
  after(() => deliverNotifications().catch(() => 0));
}

// ---------- Notifications ----------

export async function markNotificationsRead() {
  return action("markNotificationsRead", async ({ supabase }) => {
    must(await supabase.rpc("mark_notifications_read"));
    refresh();
  });
}

// ---------- Cheers ----------

const CHEERS = ["👏", "🔥", "💪", "❤️", "🎉", "☕", "🍀", "😴"];
export async function sendCheer(toUser: string, emoji: string, label?: string) {
  return action("sendCheer", async ({ supabase, userId }) => {
    if (!CHEERS.includes(emoji)) throw new Error("תגובה לא מוכרת");
    const { error } = await supabase.from("reactions").insert({ from_user: userId, to_user: toUser, emoji, label: label?.slice(0, 120) ?? null });
    if (error) throw new Error("אפשר לשלוח רק לחברים");
    notifyNow();
  });
}

// ---------- Studying now ----------

export async function startStudyLive(input: { title: string; minutes: number; course_code?: string | null; with_user?: string | null }) {
  return action("startStudyLive", async ({ supabase, userId }) => {
    const minutes = Number.isFinite(input.minutes) ? Math.max(5, Math.min(300, Math.round(input.minutes))) : 60;
    await supabase.from("study_live").upsert({
      user_id: userId,
      title: input.title.slice(0, 160),
      course_code: input.course_code ?? null,
      started_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + minutes * 60_000).toISOString(),
      with_user: input.with_user ?? null,
    });
    if (input.with_user) notifyNow();
  });
}

export async function endStudyLive() {
  return action("endStudyLive", async ({ supabase, userId }) => {
    must(await supabase.from("study_live").delete().eq("user_id", userId));
  });
}

// ---------- Rough days ----------

export async function setDayOff(date: string, reason: "sick" | "reserve" | "family" | "other" | null) {
  return action("setDayOff", async ({ supabase, userId }) => {
    if (!DATE.test(date)) throw new Error("תאריך לא תקין");
    if (reason === null) await supabase.from("day_off").delete().match({ user_id: userId, date });
    else {
      const { error } = await supabase.from("day_off").upsert({ user_id: userId, date, reason });
      if (error) throw new Error(error.message);
    }
    refresh();
  });
}

// ---------- Quick add ----------

/** Saves what the one-line quick add understood (the parse happens in the browser, shown before saving). */
export async function quickAdd(input: { date: string; start: string | null; end: string | null; title: string; invite: string[] }) {
  if (input.start && input.end) return addEvent({ date: input.date, start: input.start, end: input.end, title: input.title, invite: input.invite });
  // No time: an all-day item.
  return action("quickAdd", async ({ supabase, userId }) => {
    const title = input.title.trim();
    if (!DATE.test(input.date) || !title || title.length > 200) throw new Error("חסר שם או תאריך");
    const { data, error } = await supabase
      .from("user_events")
      .insert({ user_id: userId, date: input.date, title, kind: "custom", source: "manual" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (input.invite.length) await supabase.rpc("invite_to_event", { p_event: data.id, p_users: input.invite });
    notifyNow();
    refresh();
  });
}

// ---------- Common free time ----------

/** Free times in the next 7 days when I and all chosen friends (who share their schedule) are free. */
export async function findCommonSlots(friendIds: string[], minutes: number) {
  return action("findCommonSlots", async () => {
    const { getFriendView, getUserPlan } = await import("@/lib/userdata");
    const { summarize } = await import("@/lib/friends");
    const { occurrencesFor } = await import("@/lib/planfor");
    const { todayInIsrael, addDays, formatHebrewDate } = await import("@/lib/semester");
    const { israelNow } = await import("@/lib/privateFeed");
    const today = todayInIsrael();
    const to = addDays(today, 6);
    const len = Math.max(30, Math.min(300, Math.round(minutes)));
    const busy: { date: string; s: number; e: number }[] = [];
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const add = (date: string, start: string, end: string) => {
      const s = toMin(start);
      const e = end <= start ? 24 * 60 : toMin(end);
      busy.push({ date, s, e });
    };

    const mine = await getUserPlan(today);
    for (const s of mine.plan.sessions) if (s.date <= to) add(s.date, s.start, s.end);
    for (const ev of mine.events) if (ev.date >= today && ev.date <= to && ev.start_time && ev.end_time && !ev.cancelled) add(ev.date, ev.start_time, ev.end_time);
    for (const o of occurrencesFor({ routines: mine.routines, logs: mine.logs, events: mine.events, plan: mine.plan, today, from: today, to, offDays: mine.offDays }))
      if (o.start && o.end && o.category !== "sleep") add(o.date, o.start, o.end);
    const offDays = new Set(mine.offDays);

    const skipped: string[] = [];
    for (const id of friendIds.slice(0, 8)) {
      const v = await getFriendView(id);
      if (!v || v.schedule === "none") {
        if (v) skipped.push(v.name.split(" ")[0]);
        continue;
      }
      for (const b of summarize(v, today).blocks) add(b.date, b.start, b.end);
    }

    const now = israelNow();
    const slots: { date: string; start: string; end: string; label: string }[] = [];
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    for (let d = today; d <= to && slots.length < 8; d = addDays(d, 1)) {
      if (offDays.has(d)) continue;
      let perDay = 0;
      const dayBusy = busy.filter((b) => b.date === d);
      for (let t = d === today ? Math.ceil((now.minutes + 30) / 30) * 30 : 9 * 60; t + len <= 22 * 60 && perDay < 2; t += 30) {
        if (dayBusy.some((b) => t < b.e + 15 && t + len > b.s - 15)) continue;
        slots.push({
          date: d,
          start: hhmm(t),
          end: hhmm(t + len),
          label: `${d === today ? "היום" : formatHebrewDate(d, { weekday: "short", day: "numeric", month: "numeric" })} ${hhmm(t)}`,
        });
        perDay++;
        t += Math.max(len, 120) - 30; // spread the suggestions out
      }
    }
    return { slots, skipped };
  });
}

// ---------- Profile & look ----------

export interface ProfileInput {
  name: string;
  bio: string;
  program: string;
  study_year: string;
  avatar_emoji: string;
  avatar_color: string;
  weekly_goal_minutes: number | null;
}

export async function saveProfile(input: ProfileInput) {
  return action("saveProfile", async ({ supabase, userId }) => {
    const name = input.name.trim();
    if (!name || name.length > 60) throw new Error("שם: עד 60 תווים");
    const goal = input.weekly_goal_minutes == null || Number.isNaN(input.weekly_goal_minutes) ? null : Math.max(0, Math.min(6000, Math.round(input.weekly_goal_minutes)));
    const { error } = await supabase
      .from("profiles")
      .update({
        name,
        bio: input.bio.trim().slice(0, 300) || null,
        program: input.program.trim().slice(0, 80) || null,
        study_year: input.study_year.trim().slice(0, 30) || null,
        avatar_emoji: [...input.avatar_emoji.trim()].slice(0, 4).join("") || null,
        avatar_color: /^[a-z]{3,10}$/.test(input.avatar_color) ? input.avatar_color : null,
        weekly_goal_minutes: goal,
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    // The planner reads the goal from study prefs (they travel with the private feed too).
    const { data: had } = await supabase.from("study_prefs").update({ weekly_goal_minutes: goal }).eq("user_id", userId).select("user_id");
    if (!had?.length) {
      const { defaultPrefs } = await import("@/lib/planner");
      await supabase.from("study_prefs").insert({
        user_id: userId,
        availability: defaultPrefs.availability,
        session_minutes: defaultPrefs.session_minutes,
        fill_routine: defaultPrefs.fill_routine,
        weekly_goal_minutes: goal,
      });
    }
    refresh();
  });
}

/** Look & feel (theme, palette, text size, calm mode, Today sections, focus music), kept per user. */
export async function saveLook(patch: import("@/lib/themes").LookPrefs) {
  return action("saveLook", async ({ supabase, userId }) => {
    const { data } = await supabase.from("profiles").select("prefs").eq("id", userId).maybeSingle();
    const { normalizePalette } = await import("@/lib/themes");
    const next = { ...((data?.prefs as object) ?? {}), ...patch } as import("@/lib/themes").LookPrefs;
    // removed palettes become the nearest kept one instead of silently resetting to the default
    if (next.palette) next.palette = normalizePalette(next.palette);
    if (next.style && !["classic", "soft", "bold", "glass", "notebook"].includes(next.style)) delete next.style;
    if (next.theme && !["system", "light", "dark"].includes(next.theme)) delete next.theme;
    if (next.size && !["sm", "md", "lg", "xl"].includes(next.size)) delete next.size;
    if (next.calm != null) next.calm = !!next.calm;
    if (next.music && !/^[A-Za-z0-9]{22}$/.test(next.music)) next.music = null;
    if (next.hidden) next.hidden = next.hidden.filter((h) => /^[a-z]{2,20}$/.test(h)).slice(0, 20);
    if (next.tabs) {
      const ok = ["/", "/semester", "/routines", "/friends", "/courses", "/books", "/study", "/log", "/hobbies", "/mail", "/profile", "/settings"];
      next.tabs = [...new Set(next.tabs.filter((t) => ok.includes(t)))].slice(0, 4);
    }
    const { error } = await supabase.from("profiles").update({ prefs: next }).eq("id", userId);
    if (error) throw new Error(error.message);
    refresh();
  });
}

// ---------- Quick study log ----------

/** Logs study time that wasn't a planned session ("I studied 45 min of algebra"). */
export async function logStudy(input: { course_code: string | null; minutes: number; note?: string }) {
  return action("logStudy", async ({ supabase, userId }) => {
    const minutes = Math.round(Number(input.minutes));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 600) throw new Error("כמה דקות? בין 1 ל־600");
    const code = input.course_code && /^\d{5}$/.test(input.course_code) ? input.course_code : "other";
    const { todayInIsrael } = await import("@/lib/semester");
    const key = `${todayInIsrael()}|log|${code}|${Date.now()}`;
    const { error } = await supabase.from("session_status").insert({ user_id: userId, session_key: key, status: "done", minutes, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    refresh();
    return minutes;
  });
}

// ---------- Assignment autopsy & stuck points ----------

export async function saveReview(input: { code: string; n: string; minutes_spent: number | null; difficulty: number | null; hard: string | null }) {
  return action("saveReview", async ({ supabase, userId }) => {
    if (!/^\d{5}$/.test(input.code) || !/^\w{1,4}$/.test(input.n)) throw new Error("מטלה לא תקינה");
    const { semester } = await import("@/lib/semester");
    const m = input.minutes_spent == null ? null : Math.max(0, Math.min(6000, Math.round(input.minutes_spent)));
    const d = input.difficulty == null ? null : Math.max(1, Math.min(5, Math.round(input.difficulty)));
    const { error } = await supabase.from("assignment_reviews").upsert({
      user_id: userId,
      course_code: input.code,
      semester: semester.semester,
      n: input.n,
      minutes_spent: Number.isFinite(m) ? m : null,
      difficulty: Number.isFinite(d) ? d : null,
      hard: input.hard?.slice(0, 500) ?? null,
    });
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function addStuck(input: { topic: string; course_code?: string | null }) {
  return action("addStuck", async ({ supabase, userId }) => {
    const topic = input.topic.trim().slice(0, 300);
    if (!topic) throw new Error("מה תקע אותך?");
    const code = input.course_code && /^\d{5}$/.test(input.course_code) ? input.course_code : null;
    const { error } = await supabase.from("stuck_points").insert({ user_id: userId, topic, course_code: code });
    if (error) throw new Error(error.message);
    await syncFocus(supabase, userId);
    refresh();
  });
}

/** Open "stuck" points per course, kept in study prefs so every plan (app, push, calendar feed) weighs them. */
async function syncFocus(supabase: ActionCtx["supabase"], userId: string) {
  const { data } = await supabase.from("stuck_points").select("course_code").match({ user_id: userId, resolved: false });
  const focus: Record<string, number> = {};
  for (const r of data ?? []) if (r.course_code) focus[r.course_code] = (focus[r.course_code] ?? 0) + 1;
  must(await supabase.from("study_prefs").update({ focus }).eq("user_id", userId));
}

export async function resolveStuck(id: string, resolved = true) {
  return action("resolveStuck", async ({ supabase, userId }) => {
    must(await supabase.from("stuck_points").update({ resolved }).match({ id, user_id: userId }));
    await syncFocus(supabase, userId);
    refresh();
  });
}

// In production the text of an error thrown inside a server action never reaches the browser,
// so every action runs through action() in "@/app/guard" and returns { failed: "<Hebrew message>" };
// "@/app/act" turns that back into a normal Error.
export type { Failed } from "@/app/guard";
