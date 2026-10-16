/** A person's picture, or their initial on a coloured circle. */
export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const hue = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  if (url)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    );
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: `hsl(${hue} 45% 45%)`, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}
