import HabitCoachingCard from './HabitCoachingCard';
import HabitComplianceChart from './HabitComplianceChart';
import HabitHeatmap from './HabitHeatmap';
import HabitInsightsCard from './HabitInsightsCard';
import HabitLeaderboard from './HabitLeaderboard';
import HabitScores from './HabitScores';
import HabitTrendSummary from './HabitTrendSummary';

export default function HabitTrendsTab({ trends, loading, error }) {
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
      <HabitTrendSummary summary={trends?.summary} />
      <HabitComplianceChart data={trends?.trend_chart} />
      <HabitHeatmap data={trends?.heatmap} />
      <HabitLeaderboard data={trends?.leaderboard} />
      <HabitScores scores={trends?.scores} />
      <HabitCoachingCard context={trends?.coaching_context} />
      <HabitInsightsCard insights={trends?.coaching_context?.insights} />
    </div>
  );
}
