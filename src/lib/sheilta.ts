/**
 * Sheilta sync: the student's courses and grades as Sheilta knows them, applied to the degree plan.
 * Pure and client-safe.
 *
 * Source: Sheilta's own endpoint /Main/api/coursesApi/get (the "קורסים וציונים" page reads it). The
 * bookmarklet on /degree/sync runs on sheilta.apps.openu.ac.il while the student is signed in, reads it,
 * and hands a compact copy to Unihub in the URL hash — no university password is ever stored.
 * Compact row: [code, name, semester, statusCode, statusName, finalGrade, examGrade, credits].
 * Status codes seen (calculatedStatusCode): 1 הצלחה, 2 בלימוד, 4 הרשמה מחדש (an earlier attempt,
 * superseded by a later registration), 13 אי עמידה בדרישות.
 */
import { COURSE, isSemester, nameOf, semIndex, semLabel, type DegreePlan, type PlanItem } from "@/lib/degree";

export type SyncStatus = "passed" | "studying" | "failed" | "retaken" | "registered" | "other";

export interface SheiltaRecord {
  code: string;
  name: string;
  sem: string;
  status: SyncStatus;
  statusName: string;
  grade: number | null;
  exam: number | null;
  credits: number | null;
}

export interface SheiltaSnapshot {
  syncedAt: string;
  records: SheiltaRecord[];
}

const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null;
};

export function statusFrom(code: string, name: string, sem: string, current: string): SyncStatus {
  if (code === "1" || /הצלח|עבר/.test(name)) return "passed";
  if (code === "13" || /אי עמידה|נכשל|לא עבר/.test(name)) return "failed";
  if (code === "4" || /הרשמה מחדש/.test(name)) return "retaken";
  if (isSemester(sem) && semIndex(sem) > semIndex(current)) return "registered";
  if (code === "2" || /בלימוד/.test(name)) return "studying";
  if (/רשו|נרשמ/.test(name)) return "registered";
  return "other";
}

type ApiCourse = {
  courseId?: string;
  courseName?: string;
  semester?: string;
  statusCodeDisp?: string;
  statusDesc?: string;
  finalGrade?: string | number | null;
  examGrade?: string | number | null;
  points?: string | number | null;
  innerStudentCourse?: { studyStatus?: { calculatedStatusCode?: string; calculatedStatusName?: string } | null; creditPoints?: number | null } | null;
};

/**
 * Reads what the bookmarklet sent (compact rows) or the raw endpoint JSON pasted by hand.
 * Unknown shapes and bad rows are dropped; at most 200 rows.
 */
export function parseSheilta(input: unknown, current: string): SheiltaRecord[] {
  let data = input;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  const out: SheiltaRecord[] = [];
  for (const row of data.slice(0, 200)) {
    let code: string, name: string, sem: string, sCode: string, sName: string, final: unknown, exam: unknown, credits: unknown;
    if (Array.isArray(row)) {
      [code, name, sem, sCode, sName, final, exam, credits] = row.map((x) => (x === null || x === undefined ? "" : x)) as [string, string, string, string, string, unknown, unknown, unknown];
    } else if (row && typeof row === "object") {
      const c = row as ApiCourse;
      const st = c.innerStudentCourse?.studyStatus;
      code = String(c.courseId ?? "");
      name = String(c.courseName ?? "");
      sem = String(c.semester ?? "");
      sCode = String(st?.calculatedStatusCode ?? c.statusCodeDisp ?? "");
      sName = String(st?.calculatedStatusName ?? c.statusDesc ?? "");
      final = c.finalGrade;
      exam = c.examGrade;
      credits = c.points || c.innerStudentCourse?.creditPoints;
    } else continue;
    code = String(code).trim();
    sem = String(sem).trim();
    if (!/^\d{5}$/.test(code) || !isSemester(sem)) continue;
    const cr = Number(credits);
    out.push({
      code,
      name: String(name).trim().slice(0, 80),
      sem,
      status: statusFrom(String(sCode), String(sName), sem, current),
      statusName: String(sName).trim().slice(0, 40),
      grade: num(final),
      exam: num(exam),
      credits: Number.isFinite(cr) && cr > 0 && cr <= 12 ? cr : null,
    });
  }
  return out;
}

export interface SyncChange {
  code: string;
  text: string;
  kind: "passed" | "failed" | "placed" | "added";
}

/**
 * Applies Sheilta's facts to a plan:
 * - a pass → the course is done in the semester it passed, with its grade (also for courses the plan
 *   didn't list: program courses and outside courses with credits are added);
 * - the latest attempt didn't meet requirements, and the plan still had it at or before that semester
 *   → back to "not placed" (failedIn = that semester), to be rescheduled;
 * - registered for an upcoming semester while the plan had it unplaced → placed there.
 * Recognized (credited) courses are never touched. Returns a new plan and what changed.
 */
export function applySync(plan: DegreePlan, records: SheiltaRecord[], current: string): { plan: DegreePlan; changes: SyncChange[] } {
  const items: PlanItem[] = plan.items.map((i) => ({ ...i }));
  const changes: SyncChange[] = [];
  const byCode = new Map<string, SheiltaRecord[]>();
  for (const r of records) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);
  for (const [code, recs] of byCode) {
    recs.sort((a, b) => semIndex(a.sem) - semIndex(b.sem));
    const pass = [...recs].reverse().find((r) => r.status === "passed");
    const last = recs[recs.length - 1];
    let item = items.find((i) => i.code === code);
    if (item?.credited) continue;
    if (pass) {
      if (!item) {
        const credits = COURSE[code]?.credits ?? pass.credits;
        if (!credits) continue;
        item = { code, sem: pass.sem, passed: true, grade: pass.grade, ...(COURSE[code] ? {} : { name: pass.name, credits }) };
        items.push(item);
        changes.push({ code, kind: "added", text: `${nameOf(item)}: נוסף — הושלם ב${semLabel(pass.sem)}${pass.grade !== null ? `, ציון ${pass.grade}` : ""}` });
        continue;
      }
      const before = JSON.stringify([item.sem, item.passed, item.grade, item.failedIn]);
      item.sem = pass.sem;
      item.passed = true;
      if (pass.grade !== null) item.grade = pass.grade;
      delete item.failedIn;
      delete item.expected;
      if (JSON.stringify([item.sem, item.passed, item.grade, item.failedIn]) !== before)
        changes.push({ code, kind: "passed", text: `${nameOf(item)}: הושלם ב${semLabel(pass.sem)}${pass.grade !== null ? `, ציון ${pass.grade}` : ""}` });
      continue;
    }
    if (!item) continue;
    if (last.status === "failed" && semIndex(last.sem) <= semIndex(current) && (!item.sem || semIndex(item.sem) <= semIndex(last.sem))) {
      if (item.sem !== null || item.failedIn !== last.sem) {
        item.sem = null;
        item.failedIn = last.sem;
        item.passed = false;
        changes.push({ code, kind: "failed", text: `${nameOf(item)}: לא הושלם ב${semLabel(last.sem)} — חזר ל"עוד לא משובצים"` });
      }
      continue;
    }
    if ((last.status === "registered" || last.status === "studying") && !item.sem && semIndex(last.sem) >= semIndex(current)) {
      item.sem = last.sem;
      changes.push({ code, kind: "placed", text: `${nameOf(item)}: שובץ ב${semLabel(last.sem)} לפי ההרשמה בשאילתא` });
    }
  }
  return { plan: { ...plan, items }, changes };
}

export interface RegistrationRow {
  code: string;
  name: string;
  /** null = no Sheilta data yet */
  registered: boolean | null;
}
export interface RegistrationExtra {
  code: string;
  name: string;
  /** where the plan has it now (null = not in the plan / not placed) */
  plannedIn: string | null;
}

/** Planned courses of a semester vs. what Sheilta shows registered there. */
export function registrationDiff(plan: DegreePlan, snapshot: SheiltaSnapshot | null, sem: string): { rows: RegistrationRow[]; extra: RegistrationExtra[] } {
  const regs = (snapshot?.records ?? []).filter((r) => r.sem === sem && (r.status === "registered" || r.status === "studying" || r.status === "passed"));
  const planned = plan.items.filter((i) => i.sem === sem && !i.credited);
  const rows = planned.map((i) => ({ code: i.code, name: nameOf(i), registered: snapshot ? regs.some((r) => r.code === i.code) : null }));
  const extra = regs
    .filter((r) => !planned.some((i) => i.code === r.code))
    .map((r) => ({ code: r.code, name: COURSE[r.code]?.name ?? r.name, plannedIn: plan.items.find((i) => i.code === r.code)?.sem ?? null }));
  return { rows, extra };
}

/**
 * The bookmarklet: on Sheilta it reads the courses endpoint and opens Unihub's sync page with the rows
 * in the hash (never sent to a server by the browser); anywhere else it opens Sheilta's courses page.
 */
export function bookmarklet(origin: string) {
  const js = `(async()=>{if(location.host!=='sheilta.apps.openu.ac.il'){location.href='https://sheilta.apps.openu.ac.il/Main/Courses';return}try{const r=await fetch('/Main/api/coursesApi/get',{credentials:'include'});if(!r.ok)throw 0;const j=await r.json();const d=j.map(c=>{const s=(c.innerStudentCourse&&c.innerStudentCourse.studyStatus)||{};return[c.courseId,c.courseName,c.semester,s.calculatedStatusCode||c.statusCodeDisp||'',s.calculatedStatusName||c.statusDesc||'',c.finalGrade||'',c.examGrade||'',c.points||'']});location.href='${origin}/degree/sync#d='+encodeURIComponent(JSON.stringify(d))}catch(e){alert('לא הצלחתי לקרוא מהשאילתא. להתחבר לשאילתא ולנסות שוב.')}})()`;
  return "javascript:" + encodeURIComponent(js).replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%2F/g, "/");
}
