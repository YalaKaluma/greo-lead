const scoreLabels = {
  discipline_score: {
    title: 'Discipline Score',
    description: 'Overall completion rate'
  },
  consistency_score: {
    title: 'Consistency Score',
    description: 'Reliability across weeks'
  },
  momentum_score: {
    title: 'Momentum Score',
    description: 'Direction of travel'
  }
};

export default function HabitScores({ scores }) {
  if (!scores) return null;

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {Object.entries(scoreLabels).map(([key, config]) => {
        const value = scores[key] || 0;
        return (
          <div key={key} className="rounded-lg border bg-white p-4">
            <div className="text-sm font-semibold text-slate-700">{config.title}</div>
            <div className="mt-2 flex items-end gap-1">
              <span className="text-3xl font-bold text-slate-900">{value}</span>
              <span className="pb-1 text-sm text-slate-500">/ 100</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.min(value, 100)}%` }} />
            </div>
            <div className="mt-2 text-xs text-slate-500">{config.description}</div>
          </div>
        );
      })}
    </div>
  );
}
