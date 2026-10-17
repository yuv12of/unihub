import { PALETTE } from "@/lib/semester";

/** A person's chosen emoji, their Google picture, or their initial on a coloured circle. */
export function Avatar({
  name,
  url,
  size = 36,
  emoji,
  color,
}: {
  name: string;
  url?: string | null;
  size?: number;
  emoji?: string | null;
  color?: string | null;
}) {
  const hue = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  const bg = color && PALETTE[color] ? PALETTE[color].css : `hsl(${hue} 45% 45%)`;
  if (emoji)
    return (
      <span
        aria-hidden
        className="grid shrink-0 place-items-center rounded-full"
        style={{ width: size, height: size, background: `color-mix(in srgb, ${bg} 22%, var(--surface))`, fontSize: size * 0.55, lineHeight: 1 }}
      >
        {emoji}
      </span>
    );
  if (url)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    );
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.42 }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
