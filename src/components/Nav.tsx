"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useEffect, useState } from "react";

export interface Badges {
  friends?: number;
  admin?: number | null;
}

type Group = "study" | "life" | "social" | "account";
type Item = { href: string; label: string; icon: () => React.ReactElement; group: Group; badge?: keyof Badges; adminOnly?: boolean };

const GROUPS: Record<Group, string> = { study: "לימודים", life: "חיים", social: "חברים", account: "חשבון" };

const items: Item[] = [
  { href: "/", label: "היום", icon: IconToday, group: "study" },
  { href: "/semester", label: "לוח שנה", icon: IconSemester, group: "study" },
  { href: "/courses", label: "קורסים", icon: IconCourses, group: "study" },
  { href: "/books", label: "ספרים", icon: IconBooks, group: "study" },
  { href: "/study", label: "תרגול", icon: IconStudy, group: "study" },
  { href: "/log", label: "יומן שעות", icon: IconLog, group: "study" },
  { href: "/routines", label: "שגרה", icon: IconRoutine, group: "life" },
  { href: "/hobbies", label: "תחביבים", icon: IconHobbies, group: "life" },
  { href: "/friends", label: "חברים", icon: IconFriends, badge: "friends", group: "social" },
  { href: "/mail", label: "דואר", icon: IconMail, group: "account" },
  { href: "/profile", label: "פרופיל", icon: IconProfile, group: "account" },
  { href: "/settings", label: "הגדרות", icon: IconSettings, group: "account" },
  { href: "/admin", label: "חשבונות", icon: IconAdmin, badge: "admin", adminOnly: true, group: "account" },
];
const PHONE_MAIN = 4; // the rest live under "more"
/** Default phone tabs; each user can pick their own four (Settings → look). */
export const DEFAULT_TABS = ["/", "/semester", "/courses", "/study"];
/** Pages that can sit in the phone tab bar, for the picker. */
export const TAB_CHOICES = items.filter((i) => !i.adminOnly).map((i) => ({ href: i.href, label: i.label }));

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
}

const visible = (badges: Badges) => items.filter((i) => !i.adminOnly || badges.admin != null);

function Dot({ n }: { n?: number | null }) {
  if (!n) return null;
  return (
    <span className="grid min-w-5 place-items-center rounded-full bg-highlight px-1.5 text-[11px] font-semibold leading-5 text-highlight-ink ring-1 ring-ink/40" aria-label={`${n} חדשים`}>
      {n}
    </span>
  );
}

/**
 * Vertical navigation: a full sidebar on computers (grouped: study / life / social / account),
 * an icon rail with tooltips on iPad portrait (768–1023px).
 */
export function SideNav({ badges = {} }: { badges?: Badges }) {
  const isActive = useActive();
  const list = visible(badges);
  const groups = (Object.keys(GROUPS) as Group[]).filter((g) => list.some((i) => i.group === g));
  return (
    <nav aria-label="ניווט ראשי" className="mt-6 flex flex-col gap-3 lg:mt-7 lg:gap-4">
      {groups.map((g, gi) => (
        <div key={g} className={gi ? "border-t border-rule pt-3 lg:border-0 lg:pt-0" : ""}>
          <p className="mb-1 hidden px-3 text-[11px] font-medium text-ink-soft lg:block">{GROUPS[g]}</p>
          <ul className="flex flex-col gap-0.5">
            {list
              .filter((i) => i.group === g)
              .map(({ href, label, icon: Icon, badge }) => {
                const active = isActive(href);
                const n = badge ? badges[badge] : null;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      title={label}
                      className={`relative flex items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors lg:justify-start lg:py-2 ${
                        active ? "accent-surface font-medium" : "text-ink-soft hover:bg-rule/60 hover:text-ink"
                      }`}
                    >
                      <Icon />
                      <span className="sr-only lg:not-sr-only lg:flex-1">{label}</span>
                      {n ? (
                        <>
                          <span className="hidden lg:inline">
                            <Dot n={n} />
                          </span>
                          <span className="absolute end-2 top-1.5 size-2.5 rounded-full bg-highlight ring-2 ring-ink/50 lg:hidden" aria-hidden />
                        </>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Bottom tab bar on phones: four main places + "more". */
export function TabBar({ badges = {}, tabs }: { badges?: Badges; tabs?: string[] | null }) {
  const isActive = useActive();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const all = visible(badges);
  const chosen = (tabs?.length ? tabs : DEFAULT_TABS).filter((h) => all.some((i) => i.href === h)).slice(0, PHONE_MAIN);
  const main = chosen.map((h) => all.find((i) => i.href === h)!);
  const more = all.filter((i) => !chosen.includes(i.href));
  const moreActive = more.some((i) => isActive(i.href));
  const moreBadge = more.reduce((n, i) => n + ((i.badge && badges[i.badge]) || 0), 0);
  const tab = "relative flex flex-col items-center gap-1 pt-3 pb-1.5 text-[12px]";

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/25 md:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}
      <nav
        aria-label="ניווט ראשי"
        className="app-tabbar relative z-40 shrink-0 border-t border-rule bg-surface pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:hidden"
      >
        {open && (
          <ul className="absolute inset-x-0 bottom-full grid grid-cols-3 gap-2 border-t border-rule bg-surface px-4 py-4 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
            {more.map(({ href, label, icon: Icon, badge }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 rounded-xl py-3 text-sm ${isActive(href) ? "accent-surface" : "bg-bg text-ink"}`}
                >
                  <Icon />
                  <span className="flex items-center gap-1">
                    {label}
                    {badge && <Dot n={badges[badge]} />}
                  </span>
                </Link>
              </li>
            ))}
            <li className="col-span-3 text-center">
              <Link href="/settings#look" className="btn-ghost text-xs">
                בחירת הלשוניות בסרגל
              </Link>
            </li>
          </ul>
        )}
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {main.map(({ href, label, icon: Icon, badge }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link href={href} aria-current={active ? "page" : undefined} className={`${tab} ${active ? "text-ink font-semibold" : "text-ink-soft"}`}>
                  <Icon />
                  {label}
                  {badge && badges[badge] ? (
                    <span className="absolute end-[calc(50%-1.1rem)] top-2 size-2.5 rounded-full bg-highlight ring-2 ring-ink/50" aria-label="חדש" />
                  ) : null}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={`${tab} w-full ${moreActive || open ? "text-ink font-semibold" : "text-ink-soft"}`}
            >
              <IconMore />
              עוד
              {moreBadge > 0 && <span className="absolute end-[calc(50%-1.1rem)] top-2 size-2.5 rounded-full bg-highlight ring-2 ring-ink/50" aria-label="חדש" />}
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function IconLog() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function IconToday() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </svg>
  );
}

function IconCourses() {
  return (
    <svg {...iconProps}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" />
    </svg>
  );
}

function IconHobbies() {
  return (
    <svg {...iconProps}>
      <path d="M12 20.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z" />
    </svg>
  );
}

function IconBooks() {
  return (
    <svg {...iconProps}>
      <path d="M5 4.5h4v15H5zM10 4.5h4v15h-4z" />
      <path d="m15.2 5.6 3.8-1 3 14.3-3.8 1z" />
    </svg>
  );
}

function IconSemester() {
  return (
    <svg {...iconProps}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg {...iconProps}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function IconStudy() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="6" width="13" height="14" rx="2" />
      <path d="M8 3.5h10a2 2 0 0 1 2 2V16" />
      <path d="M8 11.5h5M8 15h3" />
    </svg>
  );
}

function IconRoutine() {
  return (
    <svg {...iconProps}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4h-4" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}

function IconFriends() {
  return (
    <svg {...iconProps}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19.5c.7-3.3 3.1-5 6-5s5.3 1.7 6 5" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M16.5 14.6c2.3.2 3.9 1.6 4.5 4.4" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg {...iconProps}>
      <circle cx="5.5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18.5" cy="12" r="1.3" />
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg {...iconProps}>
      <path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.5 20c.9-3.8 3.9-5.8 7.5-5.8s6.6 2 7.5 5.8" />
    </svg>
  );
}
