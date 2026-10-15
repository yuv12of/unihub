/** Google Apps Script the user pastes into script.google.com to forward university mail to Unihub. */
export function mailScript(endpoint: string, token: string) {
  return `// Unihub: sends mail from the Open University (openu.ac.il) to your Unihub mailbox.
// Runs in your own Google account. Only messages from openu.ac.il are read and sent.

const UNIHUB_URL = '${endpoint}';
const TOKEN = '${token}';
const MAX_ATTACHMENT_BYTES = 2500000;

function syncUniversityMail() {
  sendMatching_('from:openu.ac.il newer_than:3d', 50);
}

// Run once: imports the last year of university mail and turns on the 10-minute sync.
// Running it again is safe: existing messages are not duplicated (their formatting is filled in).
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncUniversityMail').timeBased().everyMinutes(10).create();
  sendMatching_('from:openu.ac.il newer_than:365d', 250);
}

function sendMatching_(query, limit) {
  const started = Date.now();
  for (let start = 0; start < limit; start += 50) {
    const threads = GmailApp.search(query, start, 50);
    if (threads.length === 0) return;
    for (const thread of threads) {
      for (const msg of thread.getMessages()) {
        if (Date.now() - started > 5 * 60 * 1000) return; // stay under the 6-minute limit
        if (!/openu\\.ac\\.il/i.test(msg.getFrom())) continue;
        const attachments = msg.getAttachments({ includeInlineImages: false })
          .filter(function (a) { return a.getSize() <= MAX_ATTACHMENT_BYTES; })
          .map(function (a) {
            return { name: a.getName(), type: a.getContentType(), size: a.getSize(),
                     data: Utilities.base64Encode(a.getBytes()) };
          });
        UrlFetchApp.fetch(UNIHUB_URL, {
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + TOKEN },
          muteHttpExceptions: true,
          payload: JSON.stringify({
            id: msg.getId(), threadId: thread.getId(), sender: msg.getFrom(),
            subject: msg.getSubject(), date: msg.getDate().toISOString(),
            body: msg.getPlainBody(), html: msg.getBody(), attachments: attachments,
          }),
        });
      }
    }
  }
}
`;
}
