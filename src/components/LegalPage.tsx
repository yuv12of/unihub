import Link from "next/link";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 leading-relaxed">
      <Link href="/" className="font-display text-2xl">
        Unihub
      </Link>
      <h1 className="mt-6 font-display text-4xl">{title}</h1>
      <p className="mt-1 text-sm text-ink-soft">עודכן לאחרונה: {updated}</p>
      <div className="legal mt-6 space-y-4 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ms-5 [&_li]:list-disc [&_ul]:space-y-1">{children}</div>
      <footer className="mt-12 flex gap-4 border-t border-rule pt-4 text-sm text-ink-soft">
        <Link href="/privacy" className="underline underline-offset-4 decoration-rule hover:text-ink">
          מדיניות פרטיות
        </Link>
        <Link href="/terms" className="underline underline-offset-4 decoration-rule hover:text-ink">
          תנאי שימוש
        </Link>
      </footer>
    </main>
  );
}

export const CONTACT = "yuv12of@gmail.com";
