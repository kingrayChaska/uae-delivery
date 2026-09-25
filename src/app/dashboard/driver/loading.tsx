const Loading = () => (
  <main className="flex flex-1 flex-col gap-6 p-6 animate-pulse">
    <div className="h-8 w-48 rounded bg-muted" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 rounded-lg bg-muted" />
      ))}
    </div>
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 rounded-md bg-muted" />
      ))}
    </div>
  </main>
);

export default Loading;
