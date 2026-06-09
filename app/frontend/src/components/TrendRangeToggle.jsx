const RANGE_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 21, label: '21 days' },
  { value: 90, label: '90 days' },
];

export default function TrendRangeToggle({ value, onChange, label = 'Trend range' }) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-1" aria-label={label}>
      {RANGE_OPTIONS.map((option) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              isActive
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
