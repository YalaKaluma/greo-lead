import { useEffect, useState } from 'react';
import axios from 'axios';

const statusLabels = {
  accelerating: 'Accelerating',
  on_track: 'On Track',
  stalled: 'Stalled',
  constrained: 'Constrained',
  steady: 'Steady',
  at_risk: 'At Risk'
};

const statusSignals = {
  accelerating: {
    label: 'Strong',
    dot: 'bg-emerald-500',
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-700'
  },
  on_track: {
    label: 'On track',
    dot: 'bg-emerald-500',
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-700'
  },
  steady: {
    label: 'Steady',
    dot: 'bg-emerald-500',
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-700'
  },
  stalled: {
    label: 'Watch',
    dot: 'bg-amber-500',
    pill: 'border-amber-200 bg-amber-50 text-amber-700'
  },
  constrained: {
    label: 'Constrained',
    dot: 'bg-amber-500',
    pill: 'border-amber-200 bg-amber-50 text-amber-700'
  },
  at_risk: {
    label: 'At risk',
    dot: 'bg-rose-500',
    pill: 'border-rose-200 bg-rose-50 text-rose-700'
  }
};

const formatDate = (value) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const EmptyState = ({ children }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
    {children}
  </div>
);

const RefreshIcon = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 0 1-15.2 6.5" />
    <path d="M3 12A9 9 0 0 1 18.2 5.5" />
    <path d="M18 2v4h-4" />
    <path d="M6 22v-4h4" />
  </svg>
);

const TaskList = ({ items, emptyText, dateLabel = 'Due' }) => {
  if (!items?.length) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
      {items.map(item => (
        <div key={item.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_150px]">
          <div>
            <div className="font-medium text-slate-900">{item.title}</div>
            {item.linked_outcome && (
              <div className="mt-1 text-xs text-slate-500">{item.linked_outcome}</div>
            )}
          </div>
          <div className="text-sm text-slate-600 md:text-right">
            <span className="text-xs uppercase text-slate-400">{dateLabel}</span>
            <div>{formatDate(item.due_date || item.completed_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

const BulletList = ({ items, emptyText }) => {
  if (!items?.length) {
    return <p className="mt-3 text-sm text-slate-600">{emptyText}</p>;
  }

  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
};

export default function GoalProgressReview({ apiUrl, userNumber, expandedGoalId }) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [recommendationActions, setRecommendationActions] = useState({});

  const loadReview = async () => {
    if (!expandedGoalId) return;
    setLoading(true);
    setError('');

    try {
      const res = await axios.get(`${apiUrl}/api/journey/visions/${expandedGoalId}/progress-review`, {
        params: { user_number: userNumber }
      });
      setReview(res.data);
      setRecommendationActions({});
    } catch (err) {
      console.error('Error loading progress review:', err);
      setError(err.response?.data?.detail || 'Could not load the progress review.');
    } finally {
      setLoading(false);
    }
  };

  const refreshReview = async () => {
    if (!expandedGoalId || refreshing) return;
    setRefreshing(true);
    setRefreshMessage('');
    setRefreshError('');

    try {
      const res = await axios.post(
        `${apiUrl}/api/journey/visions/${expandedGoalId}/progress-review/refresh`,
        {},
        { params: { user_number: userNumber } }
      );
      setReview(res.data);
      setRecommendationActions({});
      setRefreshMessage('Review refreshed with the latest 7-day context.');
    } catch (err) {
      console.error('Error refreshing progress review:', err);
      setRefreshError(err.response?.data?.detail || 'Could not refresh the progress review.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadReview();
  }, [expandedGoalId, userNumber]);

  const acceptRecommendation = async (recommendationId) => {
    setRecommendationActions(prev => ({ ...prev, [recommendationId]: 'working' }));
    try {
      await axios.post(`${apiUrl}/api/opportunities/${recommendationId}/accept`, {
        user_number: userNumber
      });
      setRecommendationActions(prev => ({ ...prev, [recommendationId]: 'accepted' }));
      await loadReview();
    } catch (err) {
      console.error('Error accepting recommendation:', err);
      setRecommendationActions(prev => ({ ...prev, [recommendationId]: 'error' }));
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-slate-500">Building the executive briefing...</div>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!review) return null;

  const statusSignal = statusSignals[review.status] || statusSignals.constrained;
  const statusLabel = statusLabels[review.status] || review.status || 'Unknown';
  const nextOutcomeFocus = review.wave_summary?.next_milestone;

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Executive Summary</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-950">Status: {statusLabel}</h2>
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusSignal.pill}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${statusSignal.dot}`} />
                {statusSignal.label}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              Vision Briefing
            </div>
            <button
              type="button"
              onClick={refreshReview}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              <RefreshIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh data'}
            </button>
          </div>
        </div>
        {(refreshMessage || refreshError) && (
          <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${refreshError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {refreshError || refreshMessage}
          </div>
        )}
        <p className="max-w-5xl text-base leading-7 text-slate-700">{review.executive_summary}</p>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended Focus</p>
        <p className="mt-2 text-base font-medium leading-7 text-slate-900">{review.recommended_focus}</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key Wins</p>
          <BulletList items={review.key_wins} emptyText="No major wins logged yet." />
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key Risks</p>
          <BulletList items={review.key_risks} emptyText="No material risks detected." />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest Outcomes Achieved</p>
          {review.recent_outcomes?.length ? (
            <div className="mt-4 grid gap-3">
              {review.recent_outcomes.map(outcome => (
                <div key={outcome.id} className="rounded-md border border-slate-200 p-4">
                  <div className="font-medium text-slate-900">{outcome.title}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>{formatDate(outcome.completed_at)}</span>
                    {outcome.pillar && <span>{outcome.pillar}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState>No completed outcomes are attached to this Vision yet.</EmptyState>
            </div>
          )}
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next Outcome to Focus On</p>
          {nextOutcomeFocus ? (
            <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Based on current roadmap
              </p>
              <p className="mt-2 text-base font-semibold leading-6 text-slate-950">{nextOutcomeFocus}</p>
              {review.wave_summary?.current_wave?.title && (
                <p className="mt-2 text-sm text-slate-600">{review.wave_summary.current_wave.title}</p>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState>No next roadmap outcome is available yet.</EmptyState>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top 3 MTN Recommendations</p>
        {review.recommendations?.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {review.recommendations.map((recommendation, index) => {
              const action = recommendationActions[recommendation.id];
              return (
                <div key={recommendation.id} className="flex min-h-[240px] flex-col rounded-md border border-slate-200 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                    Recommended Action #{index + 1}
                  </div>
                  <h4 className="mt-2 font-semibold leading-snug text-slate-900">{recommendation.title}</h4>
                  {recommendation.reason && <p className="mt-3 text-sm text-slate-600">{recommendation.reason}</p>}
                  {recommendation.impact && <p className="mt-3 text-sm text-slate-700">{recommendation.impact}</p>}
                  <div className="mt-auto pt-4">
                    <button
                      type="button"
                      onClick={() => acceptRecommendation(recommendation.id)}
                      disabled={action === 'working' || action === 'accepted'}
                      className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-slate-300"
                    >
                      {action === 'working' ? 'Adding...' : action === 'accepted' ? 'Added' : 'Add to Tasks'}
                    </button>
                    {action === 'error' && (
                      <div className="mt-2 text-xs text-rose-600">Could not add this recommendation.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState>No open opportunity suggestions are available for this Vision.</EmptyState>
          </div>
        )}
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recently Completed Tasks</p>
        <div className="mt-4">
          <TaskList items={review.completed_tasks} dateLabel="Completed" emptyText="No completed tasks are linked to this Vision yet." />
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Immediate Focus</p>
            <div className="mt-4">
              <TaskList items={review.upcoming_tasks?.immediate_focus} emptyText="No active tasks are linked to this Vision." />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coming Next</p>
            <div className="mt-4">
              <TaskList items={review.upcoming_tasks?.coming_next} emptyText="No linked tasks are due in the next 30 days." />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Journal Signals Impacting This Goal</p>
        {review.journal_insights?.length ? (
          <div className="mt-4 space-y-3">
            {review.journal_insights.map((insight, index) => (
              <div key={`${insight.signal_type}-${index}`} className="rounded-md border border-slate-200 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{formatDate(insight.date)}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize text-slate-600">
                    {insight.signal_type?.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="text-sm italic text-slate-700">{insight.journal_excerpt}</p>
                <p className="mt-3 text-sm text-slate-800">{insight.impact_assessment}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState>No journal signals have been detected for this Vision yet.</EmptyState>
          </div>
        )}
      </section>
    </div>
  );
}
