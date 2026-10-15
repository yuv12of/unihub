import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Download a stored mail attachment (signed-in owner only, enforced by row-level security). */
export async function GET(_req: Request, ctx: RouteContext<"/api/mail/attachment/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("mail_attachments")
    .select("filename, mime_type, data_base64")
    .eq("id", id)
    .maybeSingle();
  if (!data?.data_base64) return new Response("Not found", { status: 404 });
  const bytes = Buffer.from(data.data_base64, "base64");
  const name = (data.filename ?? "attachment").replace(/[^\w.\-א-ת ]/g, "_");
  const type = /\.pdf$/i.test(name) ? "application/pdf" : (data.mime_type ?? "application/octet-stream");
  return new Response(bytes, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
