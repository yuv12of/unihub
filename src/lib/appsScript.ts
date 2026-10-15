/** Google Apps Script the user pastes into script.google.com. Runs in their own Google account. */
export function mailScript(origin: string, token: string) {
  return `// Unihub helper script. Runs in your own Google account.
// - Every 10 minutes: sends new mail from openu.ac.il to Unihub, and triggers study reminders.
// - Every hour: sends new Notability notes (PDFs in your Drive "Notability" folder) to Unihub.
// - Every morning at 07:00: emails you today's plan.
// Nothing else in your Gmail or Drive is read.

const UNIHUB = '${origin}';
const TOKEN = '${token}';
const NOTES_FOLDER = 'Notability';      // the Drive folder Notability backs up to
const MAX_ATTACHMENT_BYTES = 2500000;

// Run once (again after updating this code). Safe to re-run: nothing is duplicated.
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('every10Minutes').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('syncNotes').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('sendMorningDigest').timeBased().everyDays(1).atHour(7).inTimezone('Asia/Jerusalem').create();
  sendMatching_('from:openu.ac.il newer_than:365d', 250);
  syncNotes();
}

function every10Minutes() {
  sendMatching_('from:openu.ac.il newer_than:3d', 50);
  post_('/api/push/tick', {});
}

// ---------- University mail ----------

function sendMatching_(query, limit) {
  const started = Date.now();
  for (let start = 0; start < limit; start += 50) {
    const threads = GmailApp.search(query, start, 50);
    if (threads.length === 0) return;
    for (const thread of threads) {
      for (const msg of thread.getMessages()) {
        if (Date.now() - started > 4 * 60 * 1000) return; // stay under the 6-minute limit
        if (!/openu\\.ac\\.il/i.test(msg.getFrom())) continue;
        const attachments = msg.getAttachments({ includeInlineImages: false })
          .filter(function (a) { return a.getSize() <= MAX_ATTACHMENT_BYTES; })
          .map(function (a) {
            return { name: a.getName(), type: a.getContentType(), size: a.getSize(),
                     data: Utilities.base64Encode(a.getBytes()) };
          });
        post_('/api/ingest/mail', {
          id: msg.getId(), threadId: thread.getId(), sender: msg.getFrom(),
          subject: msg.getSubject(), date: msg.getDate().toISOString(),
          body: msg.getPlainBody(), html: msg.getBody(), attachments: attachments,
        });
      }
    }
  }
}

// ---------- Morning email ----------

function sendMorningDigest() {
  const res = post_('/api/digest', {});
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
    const r = ocr_(file);
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

function ocr_(file) {
  if (typeof Drive === 'undefined') return { text: '', error: 'Drive API service not added' };
  let copyId = null;
  try {
    try {
      // Drive API v3 (default for new scripts)
      copyId = Drive.Files.copy({ name: 'unihub-ocr-temp', mimeType: MimeType.GOOGLE_DOCS }, file.getId(), { ocrLanguage: 'he' }).id;
    } catch (v3err) {
      // Drive API v2
      copyId = Drive.Files.copy({ title: 'unihub-ocr-temp', mimeType: MimeType.GOOGLE_DOCS }, file.getId(), { ocr: true, ocrLanguage: 'he' }).id;
    }
    const text = DocumentApp.openById(copyId).getBody().getText();
    return { text: text, error: text.trim() ? '' : 'no text recognised' };
  } catch (e) {
    return { text: '', error: String(e).slice(0, 400) };
  } finally {
    if (copyId) { try { DriveApp.getFileById(copyId).setTrashed(true); } catch (e) {} }
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
