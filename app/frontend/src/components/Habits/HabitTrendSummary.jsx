import KpiInfoButton from '../KpiInfoButton';

const periodLabels = {
  last_7_days: 'Last 7 Days',
  last_21_days: 'Last 21 Days',
  last_90_days: 'Last 90 Days'
};

const periodInfo = {
  last_7_days: 'Habit completion rate over the last 7 days. The Executive dashboard Balance Index uses this same value as its headline number.',
  last_21_days: 'Habit completion rate over the last 21 days, useful for seeing whether the latest week is part of a broader pattern.',
  last_90_days: 'Habit completion rate over the last 90 days. This is the baseline used for the Balance Index comparison.'
};

function TrendBadge({ trend }) {
  const delta = trend?.delta_vs_90 ?? trend?.delta_vs_previous ?? 0;
  const sign = delta > 0 ? '+' : '';
  const tone = trend?.label === 'Improving'
    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : trend?.label === 'Declining'
    ? 'text-rose-700 bg-rose-50 border-rose-200'
    : 'text-slate-700 bg-slate-50 border-slate-200';

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${tone}`}>
      {trend?.label || 'Stable'} - {sign}{delta} pts
    </span>
  );
}

export default function HabitTrendSummary({ summary }) {
  if (!summary) return null;

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {Object.entries(periodLabels).map(([key, label]) => {
        const item = summary[key] || {};
        return (
          <div key={key} className="relative rounded-lg border bg-white p-4">
            <KpiInfoButton label={`About ${label}`}>{periodInfo[key]}</KpiInfoButton>
            <div className="text-sm font-medium text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">{item.compliance_rate || 0}%</div>
            <div className="mt-2 text-xs text-slate-500">
              {item.completed || 0} of {item.expected || 0} expected
            </div>
            <div className="mt-3">
              <TrendBadge trend={item.trend} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
