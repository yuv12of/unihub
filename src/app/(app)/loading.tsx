/** Shown at once while a page loads: the shape of a page, so a tap always feels answered. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="טוען" className="animate-pulse motion-reduce:animate-none">
      <div className="h-4 w-24 rounded bg-rule/70" />
      <div className="mt-3 h-11 w-56 rounded-lg bg-rule/70" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <div className="h-14 rounded-xl bg-rule/50" />
          <div className="h-40 rounded-xl bg-rule/50" />
          <div className="h-28 rounded-xl bg-rule/50" />
        </div>
        <div className="hidden space-y-4 lg:block">
          <div className="h-24 rounded-xl bg-rule/50" />
          <div className="h-48 rounded-xl bg-rule/50" />
        </div>
      </div>
    </div>
  );
}
