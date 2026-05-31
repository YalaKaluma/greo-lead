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

const healthLabels = {
  green: 'Green',
  yellow: 'Yellow',
  red: 'Red'
};

const healthClasses = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  yellow: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-rose-50 text-rose-700 border-rose-200'
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

const HealthPill = ({ value }) => (
  <span className={`inline-flex min-w-[72px] justify-center rounded-full border px-2.5 py-1 text-xs font-semibold ${healthClasses[value] || healthClasses.yellow}`}>
    {healthLabels[value] || 'Yellow'}
  </span>
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

  const healthRows = [
    ['Momentum', review.goal_health?.momentum],
    ['Execution', review.goal_health?.execution],
    ['Commercial Progress', review.goal_health?.commercial_progress],
    ['Outcome Achievement', review.goal_health?.outcome_achievement],
    ['Overall Goal Health', review.goal_health?.overall_goal_health]
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Executive Summary</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Status: {statusLabels[review.status] || review.status}
            </h2>
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

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key Wins</div>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {(review.key_wins || []).map((item, index) => <li key={index}>{item}</li>)}
              {(!review.key_wins || review.key_wins.length === 0) && <li>No major wins logged yet.</li>}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key Risks</div>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {(review.key_risks || []).map((item, index) => <li key={index}>{item}</li>)}
              {(!review.key_risks || review.key_risks.length === 0) && <li>No material risks detected.</li>}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended Focus</div>
            <p className="mt-2 text-sm font-medium text-slate-800">{review.recommended_focus}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-md border border-slate-200 bg-white p-5">
          <h3 className="text-base font-semibold text-slate-900">Goal Health Score</h3>
          <div className="mt-4 divide-y divide-slate-100">
            {healthRows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between py-3">
                <span className="text-sm text-slate-700">{label}</span>
                <HealthPill value={value} />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-5">
          <h3 className="text-base font-semibold text-slate-900">Wave Progress Snapshot</h3>
          {review.wave_summary?.current_wave ? (
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div>
                <div className="text-xs uppercase text-slate-400">Current Wave</div>
                <div className="font-semibold text-slate-900">{review.wave_summary.current_wave.title}</div>
              </div>
              <div className="flex items-center justify-between">
                <span>Status</span>
                <span className="font-medium capitalize text-slate-900">{review.wave_summary.status?.replace('_', ' ')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Progress</span>
                <span className="font-medium text-slate-900">
                  {review.wave_summary.completed_outcomes} / {review.wave_summary.total_outcomes} outcomes completed
                </span>
              </div>
              <div>
                <div className="text-xs uppercase text-slate-400">Next Milestone</div>
                <div className="font-medium text-slate-900">{review.wave_summary.next_milestone || 'No next milestone set'}</div>
              </div>
            </div>
          ) : (
            <EmptyState>No roadmap wave exists for this Vision yet.</EmptyState>
          )}
        </section>
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-900">Latest Outcomes Achieved</h3>
        {review.recent_outcomes?.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
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
        <h3 className="text-base font-semibold text-slate-900">Recently Completed Tasks</h3>
        <div className="mt-4">
          <TaskList items={review.completed_tasks} dateLabel="Completed" emptyText="No completed tasks are linked to this Vision yet." />
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Immediate Focus</h3>
            <div className="mt-4">
              <TaskList items={review.upcoming_tasks?.immediate_focus} emptyText="No active tasks are linked to this Vision." />
            </div>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Coming Next</h3>
            <div className="mt-4">
              <TaskList items={review.upcoming_tasks?.coming_next} emptyText="No linked tasks are due in the next 30 days." />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-900">Top 3 MTN Recommendations</h3>
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
        <h3 className="text-base font-semibold text-slate-900">Journal Signals Impacting This Goal</h3>
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
