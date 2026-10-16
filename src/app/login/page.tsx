import { Suspense } from "react";
import { SignInButton } from "./SignInButton";

const errors: Record<string, string> = {
  "not-allowed": "החשבון הזה לא מורשה להיכנס ל־Unihub. התחברו עם החשבון האישי שלכם.",
  "sign-in-failed": "ההתחברות עם Google לא הושלמה. נסו שוב.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-5xl">Unihub</h1>
      <p className="mt-3 text-lg leading-relaxed">
        מערכת השעות, המטלות וחומרי הלימוד שלך באוניברסיטה הפתוחה, במקום אחד.
      </p>
      <Suspense fallback={null}>
        <ErrorMessage searchParams={searchParams} />
      </Suspense>
      <SignInButton />
      <p className="mt-4 text-sm text-ink-soft">חדשים כאן? התחברו, והבקשה תגיע לאישור.</p>
    </main>
  );
}

async function ErrorMessage({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error } = await searchParams;
  const msg = typeof error === "string" ? errors[error] : undefined;
  if (!msg) return null;
  return (
    <p role="alert" className="mt-6 border-s-4 border-highlight ps-3 text-sm">
      {msg}
    </p>
  );
}
