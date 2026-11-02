/** Google Apps Script the user pastes into script.google.com. Runs in their own Google account. */
export function mailScript(origin: string, token: string) {
  return `// Unihub helper script. Runs in your own Google account.
// - Every 10 minutes: sends new mail from openu.ac.il to Unihub (with the text of attached PDFs,
//   recognised by Google Drive), and triggers study reminders.
// - Every hour: sends new Notability notes (PDFs in your Drive "Notability" folder) to Unihub,
//   and asks Unihub to refresh your Opal calendar.
// - Every morning at 07:00: emails you today's plan. Fridays at 12:00: a weekly summary.
// - Optional, every hour: finds which questions and parts your assignment solutions answer (see
//   "Assignment headings" below; needs a free Gemini API key).
// Nothing else in your Gmail or Drive is read.

const UNIHUB = '${origin}';
const TOKEN = '${token}';
const NOTES_FOLDER = 'Notability';      // the Drive folder Notability backs up to
const MAX_ATTACHMENT_BYTES = 2500000;

// Google stops any run after 6 minutes. Everything in one run shares this budget, so a long job
// stops early and simply continues on the next run (nothing is sent twice).
const RUN_STARTED = Date.now();
function timeLeft_() { return 5 * 60 * 1000 - (Date.now() - RUN_STARTED); }

// Run once (again after updating this code). Safe to re-run: nothing is duplicated.
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('every10Minutes').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('hourly').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('sendMorningDigest').timeBased().everyDays(1).atHour(7).inTimezone('Asia/Jerusalem').create();
  ScriptApp.newTrigger('sendWeeklySummary').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(12).inTimezone('Asia/Jerusalem').create();
  // a first pass only: whatever doesn't fit in this run continues on the hourly and 10-minute runs
  sendMatching_('from:openu.ac.il newer_than:365d', 250, false);
  if (timeLeft_() > 90 * 1000) syncNotes();
}

function every10Minutes() {
  sendMatching_('from:openu.ac.il newer_than:3d', 50, true);
  post_('/api/push/tick', {});
}

function hourly() {
  post_('/api/sync', {});
  syncNotes();
  detectAssignmentHeadings();
}

// ---------- University mail ----------

// withText: also recognise the text of attached PDFs (the university's notices are scanned letters).
// seenKey: messages already delivered are remembered, so each one is sent (and read) only once.
function sendMatching_(query, limit, withText, seenKey) {
  seenKey = seenKey || 'sentIds';
  const props = PropertiesService.getScriptProperties();
  const seen = JSON.parse(props.getProperty(seenKey) || '[]');
  try {
    for (let start = 0; start < limit; start += 50) {
      const threads = GmailApp.search(query, start, 50);
      if (threads.length === 0) return;
      for (const thread of threads) {
        for (const msg of thread.getMessages()) {
          if (timeLeft_() < 60 * 1000) return; // stay under the 6-minute limit
          if (!/openu\\.ac\\.il/i.test(msg.getFrom()) || seen.indexOf(msg.getId()) >= 0) continue;
          const attachments = msg.getAttachments({ includeInlineImages: false })
            .filter(function (a) { return a.getSize() <= MAX_ATTACHMENT_BYTES; })
            .map(function (a) {
              const isPdf = /pdf/i.test(a.getContentType()) || /\\.pdf$/i.test(a.getName());
              return { name: a.getName(), type: a.getContentType(), size: a.getSize(),
                       data: Utilities.base64Encode(a.getBytes()),
                       text: withText && isPdf ? ocrBlob_(a.copyBlob()).text : '' };
            });
          const res = post_('/api/ingest/mail', {
            id: msg.getId(), threadId: thread.getId(), sender: msg.getFrom(),
            subject: msg.getSubject(), date: msg.getDate().toISOString(),
            body: msg.getPlainBody(), html: msg.getBody(), attachments: attachments,
          });
          if (res && res.getResponseCode() === 200) seen.push(msg.getId());
        }
      }
    }
  } finally {
    props.setProperty(seenKey, JSON.stringify(seen.slice(-700)));
  }
}

// Run once: re-reads university mail of the last 4 months with the text of their PDFs, so Unihub
// can summarise them without AI. If it stops at the time limit, just run it again; it continues.
function backfillAttachmentText() {
  sendMatching_('from:openu.ac.il newer_than:120d has:attachment', 200, true, 'textDone');
}

// ---------- Emails to yourself ----------

function sendMorningDigest() { mailFrom_('/api/digest'); }
function sendWeeklySummary() { mailFrom_('/api/weekly'); }

function mailFrom_(path) {
  const res = post_(path, {});
  if (!res || res.getResponseCode() !== 200) return;
  const d = JSON.parse(res.getContentText());
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: d.subject, htmlBody: d.html, name: 'Unihub' });
}

// ---------- Notability notes ----------
// For text recognition, enable the Drive service once: in the editor, Services (+) -> "Drive API" -> Add.

function syncNotes() {
  const folders = DriveApp.getFoldersByName(NOTES_FOLDER);
  if (!folders.hasNext()) return;
  const props = PropertiesService.getScriptProperties();
  const since = Number(props.getProperty('notesSince') || 0);
  let newest = since;
  walk_(folders.next(), NOTES_FOLDER, function (file, path) {
    if (timeLeft_() < 60 * 1000) return false;
    const updated = file.getLastUpdated().getTime();
    if (updated <= since || file.getMimeType() !== MimeType.PDF) return true;
    const r = ocrFile_(file.getId());
    post_('/api/ingest/note', {
      id: file.getId(), name: file.getName(), folder: path, url: file.getUrl(),
      modified: file.getLastUpdated().toISOString(), text: r.text, ocrError: r.error,
    });
    newest = Math.max(newest, updated);
    return true;
  });
  props.setProperty('notesSince', String(newest));
}

function walk_(folder, path, fn) {
  const files = folder.getFiles();
  while (files.hasNext()) if (fn(files.next(), path) === false) return false;
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    if (walk_(sub, path + '/' + sub.getName(), fn) === false) return false;
  }
  return true;
}

function ocrFile_(fileId) {
  if (typeof Drive === 'undefined') return { text: '', error: 'Drive API service not added' };
  let copyId = null;
  try {
    try {
      // Drive API v3 (default for new scripts)
      copyId = Drive.Files.copy({ name: 'unihub-ocr-temp', mimeType: MimeType.GOOGLE_DOCS }, fileId, { ocrLanguage: 'he' }).id;
    } catch (v3err) {
      // Drive API v2
      copyId = Drive.Files.copy({ title: 'unihub-ocr-temp', mimeType: MimeType.GOOGLE_DOCS }, fileId, { ocr: true, ocrLanguage: 'he' }).id;
    }
    const text = DocumentApp.openById(copyId).getBody().getText();
    return { text: text, error: text.trim() ? '' : 'no text recognised' };
  } catch (e) {
    return { text: '', error: String(e).slice(0, 400) };
  } finally {
    if (copyId) { try { DriveApp.getFileById(copyId).setTrashed(true); } catch (e) {} }
  }
}

// Mail attachments: put the PDF in Drive for a moment, recognise it, then remove it again.
function ocrBlob_(blob) {
  let tmp = null;
  try {
    tmp = DriveApp.createFile(blob.setName('unihub-mail-temp.pdf'));
    return ocrFile_(tmp.getId());
  } catch (e) {
    return { text: '', error: String(e).slice(0, 200) };
  } finally {
    if (tmp) { try { tmp.setTrashed(true); } catch (e) {} }
  }
}

// ---------- Assignment headings ----------
// Unihub ticks the parts of an assignment that your solution answers. Handwriting is read by Gemini,
// which is asked ONLY to list the question/part headings it sees, never to solve or judge anything.
// To turn it on: get a free API key at https://aistudio.google.com/apikey, then in this editor:
// Project Settings (gear) -> Script properties -> Add: GEMINI_API_KEY = your key. Then run
// detectAssignmentHeadings once. Without the key, nothing is sent anywhere.
// Optional property GEMINI_MODEL (default gemini-flash-latest).

const HEADINGS_PROMPT = [
  'This PDF is a student\u2019s handwritten solution to a university assignment, written in Hebrew (right to left).',
  'List the question and part headings the student wrote: question headings such as "שאלה 1" or "1.",',
  'part labels such as "א", "ב", "ג" (also written "א.", "סעיף א", "(א)"), and sub-parts such as "(1)", "(2)".',
  'Do NOT read, solve, check or evaluate the answers. Only report headings.',
  'For each heading give: q (question number), part (the Hebrew letter, or null for the question itself),',
  'sub (the sub-part number, or null), page (1-based), and has_answer (true if anything is written under',
  'the heading before the next heading, false if it is empty).',
  'Return only JSON: {"pages": <number of pages>, "parts": [{"q":1,"part":"א","sub":null,"page":1,"has_answer":true}]}.',
].join(' ');

function isAssignment_(name, path) {
  return /(ממ["\u05F4']?[ןנ]|ממן|מטל|mmn|maman|matala|assignment)/i.test(name + ' ' + path);
}

// Reads the headings of assignment solutions changed in the last 6 months that weren't read yet
// (each version once). A few per run, to stay inside the time limit and the free quota.
function detectAssignmentHeadings() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('GEMINI_API_KEY');
  if (!key) return;
  const folders = DriveApp.getFoldersByName(NOTES_FOLDER);
  if (!folders.hasNext()) return;
  const done = JSON.parse(props.getProperty('headingsDone') || '{}');
  const recent = Date.now() - 180 * 24 * 3600 * 1000;
  let left = 5;
  walk_(folders.next(), NOTES_FOLDER, function (file, path) {
    // a PDF can take Gemini a minute or more: start one only with time to spare
    if (left <= 0 || timeLeft_() < 2 * 60 * 1000) return false;
    if (file.getMimeType() !== MimeType.PDF || !isAssignment_(file.getName(), path)) return true;
    const version = String(file.getLastUpdated().getTime());
    if (file.getLastUpdated().getTime() < recent || done[file.getId()] === version) return true;
    left--;
    if (readHeadings_(file, key, props.getProperty('GEMINI_MODEL') || 'gemini-flash-latest')) done[file.getId()] = version;
    return true;
  });
  const ids = Object.keys(done);
  const kept = {};
  ids.slice(-300).forEach(function (id) { kept[id] = done[id]; });
  props.setProperty('headingsDone', JSON.stringify(kept));
}

function readHeadings_(file, key, model) {
  let headings = null, error = '';
  try {
    const bytes = file.getBlob().getBytes();
    if (bytes.length > 18000000) throw new Error('PDF larger than 18MB');
    const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': key },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { inline_data: { mime_type: 'application/pdf', data: Utilities.base64Encode(bytes) } },
          { text: HEADINGS_PROMPT },
        ] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    });
    if (res.getResponseCode() !== 200) throw new Error('Gemini ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    const out = JSON.parse(res.getContentText());
    const text = ((out.candidates || [])[0] || {}).content.parts.map(function (p) { return p.text || ''; }).join('');
    headings = JSON.parse(text);
  } catch (e) {
    error = String(e).slice(0, 400);
  }
  const r = post_('/api/ingest/headings', {
    id: file.getId(), modified: file.getLastUpdated().toISOString(), headings: headings, error: error,
  });
  // done only when stored; an error or a note Unihub doesn't have yet is tried again next hour
  return !error && r && r.getResponseCode() === 200 && JSON.parse(r.getContentText()).result === 'stored';
}

// Run this once if you want all notes re-sent (for example after enabling the Drive API).
function resyncAllNotes() {
  PropertiesService.getScriptProperties().deleteProperty('notesSince');
  syncNotes();
}

// ---------- shared ----------

function post_(path, body) {
  return UrlFetchApp.fetch(UNIHUB + path, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + TOKEN },
    muteHttpExceptions: true,
    payload: JSON.stringify(body),
  });
}
`;
}
