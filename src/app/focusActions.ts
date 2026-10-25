"use server";
import { action, must } from "@/app/guard";
import { agendaFor } from "@/lib/agendaData";
import type { AgendaStep } from "@/lib/agenda";
import type { Session, SessionKind } from "@/lib/planner";
import { addDays, todayInIsrael } from "@/lib/semester";

export interface FocusTask {
  id: string;
  text: string;
  done: boolean;
  session_key: string;
  created_at: string;
}

const KEY = /^(\d{4}-\d{2}-\d{2}\|(routine|assignment|exam)\|\d{5}\|[\w-]+|free\|\d{4}-\d{2}-\d{2}\|(\d{5}|none))$/;
const CODE = /^\d{5}$/;
const UUID = /^[0-9a-f-]{36}$/;

/**
 * Everything the focus timer's list shows: the session's plan steps (planned sessions only, with
 * their ticks), this session's own tasks, and undone tasks left from earlier sessions of the course.
 */
export async function getFocusTasks(input: { taskKey: string; courseCode: string | null; minutes: number; title: string }) {
  return action("getFocusTasks", async ({ supabase, userId }) => {
    if (!KEY.test(input.taskKey)) throw new Error("מפגש לא תקין");
    const code = input.courseCode && CODE.test(input.courseCode) ? input.courseCode : null;
    let agenda: { steps: AgendaStep[]; done: string[] } = { steps: [], done: [] };
    const [date, kind, , ref] = input.taskKey.split("|");
    if (date !== "free" && code) {
      const session: Session = { date, start: "00:00", end: "00:00", minutes: input.minutes, courseCode: code, kind: kind as SessionKind, title: input.title, ref };
      agenda = await agendaFor(session).catch(() => agenda);
    }
    const [mine, left] = await Promise.all([
      supabase.from("focus_tasks").select("id, text, done, session_key, created_at").match({ user_id: userId, session_key: input.taskKey }).order("position").order("created_at"),
      code
        ? supabase
            .from("focus_tasks")
            .select("id, text, done, session_key, created_at")
            .match({ user_id: userId, course_code: code, done: false })
            .neq("session_key", input.taskKey)
            .gte("created_at", addDays(todayInIsrael(), -21))
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] as FocusTask[], error: null }),
    ]);
    if (mine.error) throw new Error(mine.error.message);
    return { agenda, tasks: (mine.data ?? []) as FocusTask[], carried: (left.data ?? []) as FocusTask[] };
  });
}

export async function addFocusTask(input: { taskKey: string; courseCode: string | null; text: string; position: number }) {
  return action("addFocusTask", async ({ supabase, userId }) => {
    if (!KEY.test(input.taskKey)) throw new Error("מפגש לא תקין");
    const text = input.text.trim().slice(0, 200);
    if (!text) throw new Error("מה המשימה?");
    const { data } = must(
      await supabase
        .from("focus_tasks")
        .insert({
          user_id: userId,
          session_key: input.taskKey,
          course_code: input.courseCode && CODE.test(input.courseCode) ? input.courseCode : null,
          text,
          position: Math.max(0, Math.min(1000, Math.round(input.position))),
        })
        .select("id, text, done, session_key, created_at")
        .single(),
    );
    return data as FocusTask;
  });
}

export async function setFocusTaskDone(id: string, done: boolean) {
  return action("setFocusTaskDone", async ({ supabase, userId }) => {
    if (!UUID.test(id)) throw new Error("משימה לא תקינה");
    must(await supabase.from("focus_tasks").update({ done, done_at: done ? new Date().toISOString() : null }).match({ id, user_id: userId }));
  });
}

export async function deleteFocusTask(id: string) {
  return action("deleteFocusTask", async ({ supabase, userId }) => {
    if (!UUID.test(id)) throw new Error("משימה לא תקינה");
    must(await supabase.from("focus_tasks").delete().match({ id, user_id: userId }));
  });
}

/** A task left from an earlier session moves into this one. */
export async function pullFocusTask(id: string, taskKey: string) {
  return action("pullFocusTask", async ({ supabase, userId }) => {
    if (!UUID.test(id) || !KEY.test(taskKey)) throw new Error("משימה לא תקינה");
    must(await supabase.from("focus_tasks").update({ session_key: taskKey, position: 999 }).match({ id, user_id: userId }));
  });
}
