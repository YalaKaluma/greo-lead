const formatScore = (score) => {
  if (score === null || score === undefined) return 'Not scored';
  return `${Number(score).toFixed(1)} / 10`;
};

export default function JournalDepthModal({ depth, onClose }) {
  if (!depth) return null;

  const recommendations = Array.isArray(depth.recommendations) ? depth.recommendations : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Reflection Depth</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close depth details"
          >
            x
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium uppercase text-slate-500">Score</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{formatScore(depth.score)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase text-slate-500">Level</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {depth.level_label || `Level ${depth.level || '-'}`}
              </div>
            </div>
          </div>

          {depth.badge && (
            <div className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm font-medium text-emerald-700">
              {depth.badge}
            </div>
          )}

          <div>
            <div className="text-sm font-semibold text-slate-800">Explanation</div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {depth.explanation || 'Alfred has not generated a detailed explanation for this entry yet.'}
            </p>
          </div>

          {recommendations.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-slate-800">Try This Next</div>
              <ul className="mt-2 space-y-2">
                {recommendations.map((item, index) => (
                  <li key={index} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
