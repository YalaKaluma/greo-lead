import KpiInfoButton from '../KpiInfoButton';

const colorForRate = (rate, expected) => {
  if (!expected) return 'bg-slate-100';
  if (rate >= 85) return 'bg-emerald-700';
  if (rate >= 65) return 'bg-emerald-500';
  if (rate >= 40) return 'bg-amber-300';
  if (rate > 0) return 'bg-rose-300';
  return 'bg-rose-600';
};

export default function HabitHeatmap({ data }) {
  const days = Array.isArray(data) ? data : [];
  const weeks = [];

  days.forEach((day, index) => {
    if (index === 0 || day.weekday === 0) {
      weeks.push([]);
    }
    weeks[weeks.length - 1].push(day);
  });

  return (
    <div className="relative rounded-lg border bg-white p-4">
      <KpiInfoButton label="About the habit heatmap">
        Shows the last 90 days of habit completion. Each square is one day, colored by completion rate.
      </KpiInfoButton>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Habit Heatmap</h2>
        <span className="text-xs text-slate-500">Last 90 days</span>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="min-w-[360px] space-y-1">
          <div className="grid grid-cols-7 gap-1 pl-14 text-center text-[11px] text-slate-400">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(label => (
              <div key={label}>{label}</div>
            ))}
          </div>
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-[48px_repeat(7,1fr)] items-center gap-1">
              <div className="text-right text-[11px] text-slate-400">Week {weekIndex + 1}</div>
              {Array.from({ length: 7 }).map((_, weekday) => {
                const day = week.find(item => item.weekday === weekday);
                return day ? (
                  <div
                    key={day.date}
                    title={`${day.date}: ${day.compliance_rate}%`}
                    className={`h-4 min-w-4 rounded-sm ${colorForRate(day.compliance_rate, day.expected)}`}
                  />
                ) : (
                  <div key={`${weekIndex}-${weekday}`} className="h-4 min-w-4" />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500">
        <span>Low</span>
        <span className="h-3 w-3 rounded-sm bg-rose-600" />
        <span className="h-3 w-3 rounded-sm bg-rose-300" />
        <span className="h-3 w-3 rounded-sm bg-amber-300" />
        <span className="h-3 w-3 rounded-sm bg-emerald-500" />
        <span className="h-3 w-3 rounded-sm bg-emerald-700" />
        <span>High</span>
      </div>
    </div>
  );
}
