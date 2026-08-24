export default function WikiLoading() {
  return (
    <div className="h-screen paper-texture flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-[var(--accent-primary)]/70 rounded-full animate-pulse" />
          <div className="w-3 h-3 bg-[var(--accent-primary)]/70 rounded-full animate-pulse delay-75 mx-2" />
          <div className="w-3 h-3 bg-[var(--accent-primary)]/70 rounded-full animate-pulse delay-150" />
        </div>
        <p className="text-[var(--muted)] font-serif">Loading wiki...</p>
      </div>
    </div>
  );
}
