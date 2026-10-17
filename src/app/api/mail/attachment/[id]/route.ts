import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnabled } from "@/lib/supabase/config";

/** Download a stored mail attachment (signed-in owner only, enforced by row-level security). */
export async function GET(_req: Request, ctx: RouteContext<"/api/mail/attachment/[id]">) {
  await connection();
  const { id } = await ctx.params;
  if (!supabaseEnabled || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase
    .from("mail_attachments")
    .select("filename, mime_type, data_base64")
    .eq("id", id)
    .maybeSingle();
  if (!data?.data_base64) return new Response("Not found", { status: 404 });
  const bytes = Buffer.from(data.data_base64, "base64");
  const name = (data.filename ?? "attachment").replace(/[^\w.\-א-ת ]/g, "_");
  // Only PDFs and plain images open in the browser; anything else (HTML, SVG, scripts) downloads,
  // so a file from a mail can never run as part of this site.
  const SAFE = /^(application\/pdf|image\/(png|jpe?g|gif|webp))$/i;
  const guessed = /\.pdf$/i.test(name) ? "application/pdf" : (data.mime_type ?? "application/octet-stream");
  const inline = SAFE.test(guessed);
  return new Response(bytes, {
    headers: {
      "Content-Type": inline ? guessed : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'self'",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
