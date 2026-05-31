const statusStyles = {
  Improving: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Stable: 'bg-slate-100 text-slate-700 border-slate-200',
  Declining: 'bg-amber-100 text-amber-800 border-amber-200',
  'At Risk': 'bg-rose-100 text-rose-800 border-rose-200'
};

function RefreshIcon({ spinning = false }) {
  return (
    <svg
      className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 0 1-15.5 6.2" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8" />
      <path d="M18 2v4h-4" />
      <path d="M6 22v-4h4" />
    </svg>
  );
}

function ListBlock({ title, items }) {
  if (!items?.length) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase text-slate-500">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="text-sm leading-6 text-slate-700">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HabitCoachingCard({ context, review, onRefresh, refreshState }) {
  const fallback = context?.coaching || 'Alfred will generate coaching once there is enough habit history.';
  const isRefreshing = Boolean(refreshState?.loading);
  const statusClass = statusStyles[review?.status] || 'bg-slate-100 text-slate-700 border-slate-200';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Alfred Coaching</h2>
            {review?.status && (
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
                {review.status}
              </span>
            )}
          </div>
          {review?.created_at && (
            <p className="mt-1 text-xs text-slate-500">
              Updated {new Date(review.created_at).toLocaleString()}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <RefreshIcon spinning={isRefreshing} />
          {isRefreshing ? 'Refreshing...' : 'Refresh data'}
        </button>
      </div>

      {refreshState?.message && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {refreshState.message}
        </div>
      )}
      {refreshState?.error && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {refreshState.error}
        </div>
      )}

      {review ? (
        <div className="mt-5 space-y-5">
          <div>
            <h3 className="text-xs font-semibold uppercase text-slate-500">Executive Summary</h3>
            <p className="mt-2 leading-7 text-slate-800">{review.executive_summary}</p>
          </div>

          {review.what_changed && (
            <div>
              <h3 className="text-xs font-semibold uppercase text-slate-500">What Changed</h3>
              <p className="mt-2 leading-7 text-slate-700">{review.what_changed}</p>
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <ListBlock title="Key Wins" items={review.key_wins} />
            <ListBlock title="Watchouts" items={review.watchouts} />
            <ListBlock title="Reliable Habits" items={review.top_habits} />
            <ListBlock title="Needs Attention" items={review.habits_needing_attention} />
          </div>

          {review.recommended_focus && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-xs font-semibold uppercase text-slate-500">Recommended Focus</h3>
              <p className="mt-2 leading-7 text-slate-800">{review.recommended_focus}</p>
            </div>
          )}

          {review.mtn_actions?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Top 3 Habit MTN Actions</h3>
              <div className="mt-3 grid gap-3">
                {review.mtn_actions.map((action, index) => (
                  <div key={`${action.title}-${index}`} className="rounded-md border border-slate-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">
                        {index + 1}
                      </span>
                      <div>
                        <h4 className="font-semibold text-slate-900">{action.title}</h4>
                        {action.why_it_matters && (
                          <p className="mt-1 text-sm leading-6 text-slate-600">{action.why_it_matters}</p>
                        )}
                        {action.suggested_next_step && (
                          <p className="mt-2 text-sm font-medium leading-6 text-slate-800">
                            {action.suggested_next_step}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-4 leading-7 text-slate-700">{fallback}</p>
      )}
    </div>
  );
}
