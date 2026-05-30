function HabitRows({ title, rows }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-3 overflow-hidden rounded-lg border">
        <div className="grid grid-cols-[1fr_110px_100px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
          <div>Habit Name</div>
          <div className="text-right">90 Days</div>
          <div className="text-right">Streak</div>
        </div>
        {rows.map(row => (
          <div key={row.habit_id} className="grid grid-cols-[1fr_110px_100px] border-t px-3 py-2 text-sm">
            <div className="truncate text-slate-800">{row.habit_name}</div>
            <div className="text-right font-medium text-slate-700">{row.compliance_rate}%</div>
            <div className="text-right text-slate-500">{row.current_streak} days</div>
          </div>
        ))}
        {!rows.length && (
          <div className="px-3 py-4 text-sm text-slate-500">No habit data yet.</div>
        )}
      </div>
    </div>
  );
}

export default function HabitLeaderboard({ data }) {
  const rows = Array.isArray(data) ? data : [];
  const top = rows.slice(0, 3);
  const needsAttention = [...rows].reverse().slice(0, 3);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <HabitRows title="Top Habits" rows={top} />
      <HabitRows title="Needs Attention" rows={needsAttention} />
    </div>
  );
}
