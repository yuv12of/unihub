import { extractText, getDocumentProxy } from "unpdf";

/** Text layer of a PDF (no OCR). Pages joined with form feeds. Empty string for scanned PDFs. */
export async function pdfText(bytes: Uint8Array, maxPages = 400): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return (text as string[]).slice(0, maxPages).join("\f").replace(/[ \t]+\n/g, "\n").trim();
}

/**
 * Mail attachments that arrived without text (the Apps Script couldn't OCR them): read the PDF's
 * own text layer here. A few per call so the tick stays fast; '' marks "tried, nothing found".
 */
export async function backfillAttachmentText(
  admin: import("@supabase/supabase-js").SupabaseClient,
  limit = 4,
): Promise<number> {
  const { data } = await admin
    .from("mail_attachments")
    .select("id, filename, mime_type, data_base64")
    .is("text_content", null)
    .or("mime_type.ilike.%pdf%,filename.ilike.%.pdf")
    .limit(limit);
  let done = 0;
  for (const a of data ?? []) {
    let text = "";
    try {
      if (a.data_base64) text = (await pdfText(Uint8Array.from(Buffer.from(a.data_base64, "base64")), 60)).slice(0, 100000);
    } catch {}
    await admin.from("mail_attachments").update({ text_content: text }).eq("id", a.id);
    if (text) done++;
  }
  return done;
}
