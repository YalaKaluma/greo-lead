import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import HabitCoachingCard from './HabitCoachingCard';
import HabitComplianceChart from './HabitComplianceChart';
import HabitHeatmap from './HabitHeatmap';
import HabitInsightsCard from './HabitInsightsCard';
import HabitLeaderboard from './HabitLeaderboard';
import HabitScores from './HabitScores';
import HabitTrendSummary from './HabitTrendSummary';

const extractTrendChart = (payload) => {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.trend_chart,
    payload?.trendChart,
    payload?.data?.trend_chart,
    payload?.data?.trendChart,
    payload?.trends?.trend_chart,
    payload?.trends?.trendChart,
  ];
  return candidates.find(Array.isArray) || [];
};

const responseShape = (payload) => {
  if (Array.isArray(payload)) return 'array';
  if (!payload || typeof payload !== 'object') return typeof payload;
  return Object.keys(payload).slice(0, 6).join(', ') || 'object';
};

export default function HabitTrendsTab({
  apiUrl,
  userNumber,
  trends,
  loading,
  error,
  onRefreshCoaching,
  coachingRefreshState,
  onAddMtnActionToTasks,
  mtnTaskState
}) {
  const [overlayTrends, setOverlayTrends] = useState({ tasks: [], journal: [] });
  const [overlayErrors, setOverlayErrors] = useState({});

  useEffect(() => {
    if (!apiUrl || !userNumber) return;
    let cancelled = false;

    const fetchOverlays = async () => {
      try {
        const [tasksResponse, journalResponse] = await Promise.allSettled([
          axios.get(`${apiUrl}/api/tasks/mtn-trends`, { params: { user_number: userNumber } }),
          axios.get(`${apiUrl}/api/journal/journal/trends`, { params: { user_number: userNumber } }),
        ]);
        if (cancelled) return;
        setOverlayTrends({
          tasks: tasksResponse.status === 'fulfilled' ? extractTrendChart(tasksResponse.value.data) : [],
          journal: journalResponse.status === 'fulfilled' ? extractTrendChart(journalResponse.value.data) : [],
        });
        setOverlayErrors({
          tasks: tasksResponse.status === 'rejected' ? 'request failed' : '',
          journal: journalResponse.status === 'rejected' ? 'request failed' : '',
          tasksShape: tasksResponse.status === 'fulfilled' ? responseShape(tasksResponse.value.data) : '',
          journalShape: journalResponse.status === 'fulfilled' ? responseShape(journalResponse.value.data) : '',
        });
      } catch (error) {
        if (!cancelled) {
          setOverlayTrends({ tasks: [], journal: [] });
          setOverlayErrors({ tasks: 'request failed', journal: 'request failed' });
        }
      }
    };

    fetchOverlays();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, userNumber]);

  const overlays = useMemo(() => ({
    habits: trends?.trend_chart || [],
    tasks: overlayTrends.tasks,
    journal: overlayTrends.journal,
  }), [trends, overlayTrends]);

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm text-slate-500">
        Loading habit trends...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <HabitCoachingCard
        context={trends?.coaching_context}
        review={trends?.latest_coaching_review}
        onRefresh={onRefreshCoaching}
        refreshState={coachingRefreshState}
        onAddMtnActionToTasks={onAddMtnActionToTasks}
        mtnTaskState={mtnTaskState}
      />
      <HabitTrendSummary summary={trends?.summary} />
      <HabitComplianceChart data={trends?.trend_chart} overlays={overlays} overlayErrors={overlayErrors} />
      <HabitHeatmap data={trends?.heatmap} />
      <HabitLeaderboard data={trends?.leaderboard} />
      <HabitScores scores={trends?.scores} />
      <HabitInsightsCard insights={trends?.coaching_context?.insights} />
    </div>
  );
}
