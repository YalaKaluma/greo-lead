export default function HabitInsightsCard({ insights }) {
  const items = Array.isArray(insights) ? insights : [];

  return (
    <div className="rounded-lg border bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-900">What Changed?</h2>
      <div className="mt-3 space-y-2">
        {items.map((insight, index) => (
          <div key={index} className="rounded-md bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
            {insight}
          </div>
        ))}
        {!items.length && (
          <div className="text-sm text-slate-500">No meaningful shifts detected yet.</div>
        )}
      </div>
    </div>
  );
}
