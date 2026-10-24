import Link from "next/link";

/** Hebrew "not found" for unknown addresses and for notFound() (e.g. a course that isn't yours). */
export default function NotFound() {
  return (
    <div dir="rtl" className="panel mx-4 mt-10 max-w-md p-6 text-center sm:mx-auto">
      <h1 className="text-xl font-semibold">העמוד לא נמצא</h1>
      <p className="mt-2 text-ink-soft">אולי הקישור ישן, או שהקורס לא ברשימת הקורסים שלך בסמסטר הזה.</p>
      <div className="mt-5 flex justify-center gap-3">
        <Link href="/" className="rounded-lg bg-ink px-5 py-2 font-medium text-bg">
          למסך היום
        </Link>
        <Link href="/courses" className="rounded-lg border border-rule px-4 py-2 text-ink-soft hover:border-ink">
          לקורסים שלי
        </Link>
      </div>
    </div>
  );
}
