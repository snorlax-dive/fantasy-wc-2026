export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl items-center justify-center px-4 py-16">
      <div className="flex items-center gap-3 text-slate-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-cro-red" />
        <span className="text-sm font-medium">Loading…</span>
      </div>
    </main>
  )
}
