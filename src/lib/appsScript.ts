/** Google Apps Script the user pastes into script.google.com. Runs in their own Google account. */
export function mailScript(origin: string, token: string) {
  return `// Unihub helper script. Runs in your own Google account.
// - Every 10 minutes: sends new mail from openu.ac.il to Unihub (with the text of attached PDFs,
//   recognised by Google Drive), and triggers study reminders.
// - Every hour: sends new Notability notes (PDFs in your Drive "Notability" folder) to Unihub,
//   and asks Unihub to refresh your Opal calendar.
// - Every morning at 07:00: emails you today's plan. Fridays at 12:00: a weekly summary.
// Nothing else in your Gmail or Drive is read.

const UNIHUB = '${origin}';
const TOKEN = '${token}';
const NOTES_FOLDER = 'Notability';      // the Drive folder Notability backs up to
const MAX_ATTACHMENT_BYTES = 2500000;

// Run once (again after updating this code). Safe to re-run: nothing is duplicated.
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('every10Minutes').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('hourly').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('sendMorningDigest').timeBased().everyDays(1).atHour(7).inTimezone('Asia/Jerusalem').create();
  ScriptApp.newTrigger('sendWeeklySummary').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(12).inTimezone('Asia/Jerusalem').create();
  sendMatching_('from:openu.ac.il newer_than:365d', 250, false);
  hourly();
}

function every10Minutes() {
  sendMatching_('from:openu.ac.il newer_than:3d', 50, true);
  post_('/api/push/tick', {});
}

function hourly() {
  syncNotes();
  post_('/api/sync', {});
}

// ---------- University mail ----------

// withText: also recognise the text of attached PDFs (the university's notices are scanned letters).
// seenKey: messages already delivered are remembered, so each one is sent (and read) only once.
function sendMatching_(query, limit, withText, seenKey) {
  seenKey = seenKey || 'sentIds';
  const props = PropertiesService.getScriptProperties();
  const seen = JSON.parse(props.getProperty(seenKey) || '[]');
  const started = Date.now();
  try {
    for (let start = 0; start < limit; start += 50) {
      const threads = GmailApp.search(query, start, 50);
      if (threads.length === 0) return;
      for (const thread of threads) {
        for (const msg of thread.getMessages()) {
          if (Date.now() - started > 4 * 60 * 1000) return; // stay under the 6-minute limit
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
  const started = Date.now();
  let newest = since;
  walk_(folders.next(), NOTES_FOLDER, function (file, path) {
    if (Date.now() - started > 4 * 60 * 1000) return false;
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
