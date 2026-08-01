import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useLanguage } from "../../i18n/LanguageContext";

const DOMAINS = ['Vision', 'People', 'Prioritize & Execute', 'Time & Energy', 'Learning & Development'];
const SCORE_COLORS = { 1: '#dc2626', 2: '#f97316', 3: '#facc15', 4: '#6ee7b7', 5: '#16a34a' };

function TrendsWheel({ averages }) {
  const { t } = useLanguage();
  const byDomain = Object.fromEntries(averages.map((item) => [item.domain, item]));
  const polar = (angle, radius) => ({ x: 180 + radius * Math.cos((angle - 90) * Math.PI / 180), y: 180 + radius * Math.sin((angle - 90) * Math.PI / 180) });
  const segmentPath = (index) => {
    const start = index * 72;
    const end = start + 72;
    const outerStart = polar(start, 150); const outerEnd = polar(end, 150);
    const innerEnd = polar(end, 58); const innerStart = polar(start, 58);
    return `M ${outerStart.x} ${outerStart.y} A 150 150 0 0 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A 58 58 0 0 0 ${innerStart.x} ${innerStart.y} Z`;
  };

  return <div>
    <svg viewBox="0 0 360 360" className="mx-auto w-full max-w-[430px]" role="img" aria-label={t('journey.trends.wheelAria')}>
      {DOMAINS.map((domain, index) => {
        const item = byDomain[domain];
        const label = polar(index * 72 + 36, 108);
        const words = t(`meetings.leadership.domain.${domain}`).split('|');
        const color = item?.average_score ? SCORE_COLORS[Math.round(item.average_score)] : '#e2e8f0';
        return <g key={domain}>
          <path d={segmentPath(index)} fill={color} stroke="white" strokeWidth="3" />
          <text x={label.x} y={label.y - ((words.length - 1) * 8)} textAnchor="middle" className="fill-slate-900 text-[11px] font-semibold">
            {words.map((word, line) => <tspan key={word} x={label.x} dy={line ? 15 : 0}>{word}</tspan>)}
          </text>
        </g>;
      })}
      <circle cx="180" cy="180" r="53" fill="#020617" />
      <text x="180" y="174" textAnchor="middle" className="fill-white text-[15px] font-semibold">{t('meetings.leadership.hub')}</text>
      <text x="180" y="194" textAnchor="middle" className="fill-amber-300 text-[11px]">{t('journey.trends.hub')}</text>
    </svg>
    <div className="mt-2 flex justify-center gap-3 text-xs text-slate-600">{[1, 2, 3, 4, 5].map((score) => <span key={score} className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SCORE_COLORS[score] }} />{score}</span>)}</div>
  </div>;
}

export function LeadershipTrendsTab({ apiUrl, userNumber }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    axios.get(`${apiUrl}/api/meetings/leadership-trends`, { params: { user_number: userNumber } })
      .then((response) => { if (!cancelled) setData(response.data); })
      .catch((requestError) => {
        console.error('Failed to load leadership trends', requestError);
        if (!cancelled) setError(t('journey.trends.loadError'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiUrl, userNumber, t]);

  const refreshTrends = async () => {
    setRefreshing(true);
    setError('');
    try {
      const response = await axios.post(`${apiUrl}/api/meetings/leadership-trends/refresh`, null, { params: { user_number: userNumber } });
      setData(response.data);
    } catch (requestError) {
      console.error('Failed to refresh leadership trends', requestError);
      setError(t('journey.trends.loadError'));
    } finally {
      setRefreshing(false);
    }
  };

  const insights = useMemo(() => Object.fromEntries((data?.synthesis?.domain_synthesis || []).map((item) => [item.domain, item])), [data]);

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">{t('journey.trends.loading')}</div>;
  if (error && !data) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{error}</div>;
  if (!data?.meeting_count) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h2 className="text-xl font-semibold text-slate-950">{t('journey.trends.title')}</h2><p className="mx-auto mt-2 max-w-2xl text-slate-600">{t('journey.trends.empty')}</p><button type="button" onClick={refreshTrends} disabled={refreshing} className="mt-5 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{refreshing ? t('journey.trends.refreshing') : t('journey.trends.refresh')}</button></div>;

  return <section className="space-y-6">
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">{t('journey.trends.period')}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-2xl font-semibold text-slate-950">{t('journey.trends.title')}</h2><p className="mt-1 text-sm text-slate-600">{t('journey.trends.basedOn')} {data.meeting_count} {data.meeting_count === 1 ? t('journey.trends.meeting') : t('journey.trends.meetings')}. {t('journey.trends.noReassessment')}</p></div>
        <div className="flex flex-col items-end gap-2"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">{t('journey.trends.average')}</span><button type="button" onClick={refreshTrends} disabled={refreshing} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500 hover:text-slate-950 disabled:opacity-50">{refreshing ? t('journey.trends.refreshing') : t('journey.trends.refresh')}</button></div>
      </div>
      {data.generated_at && <p className="mt-3 text-xs text-slate-500">{t('journey.trends.lastUpdated')} {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generated_at))}</p>}
      <p className="mt-5 max-w-5xl whitespace-pre-line text-base leading-7 text-slate-700">{data.synthesis?.overall_summary}</p>
    </div>

    {(data.synthesis?.leadership_signature || data.synthesis?.highest_leverage_opportunity || data.synthesis?.productive_tension) && <div className="grid gap-4 lg:grid-cols-3">
      {data.synthesis?.leadership_signature && <div className="rounded-xl border border-blue-200 bg-blue-50 p-5"><h3 className="font-semibold text-blue-950">{t('journey.trends.signature')}</h3><p className="mt-2 text-sm leading-6 text-blue-950">{data.synthesis.leadership_signature}</p></div>}
      {data.synthesis?.highest_leverage_opportunity && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-semibold text-amber-950">{t('journey.trends.leverage')}</h3><p className="mt-2 text-sm leading-6 text-amber-950">{data.synthesis.highest_leverage_opportunity}</p></div>}
      {data.synthesis?.productive_tension && <div className="rounded-xl border border-violet-200 bg-violet-50 p-5"><h3 className="font-semibold text-violet-950">{t('journey.trends.tension')}</h3><p className="mt-2 text-sm leading-6 text-violet-950">{data.synthesis.productive_tension}</p></div>}
    </div>}

    <div className="grid gap-6 xl:grid-cols-[460px_minmax(0,1fr)] xl:items-start">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><TrendsWheel averages={data.domain_averages || []} /></div>
      <div className="space-y-3">{DOMAINS.map((domain) => {
        const average = data.domain_averages?.find((item) => item.domain === domain);
        const insight = insights[domain];
        return <div key={domain} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-slate-950">{t(`meetings.leadership.domain.${domain}`).replace('|', ' ')}</h3><div className="flex items-center gap-2">{insight?.signal_strength && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{t(`journey.trends.signal.${insight.signal_strength}`, insight.signal_strength)}</span>}<span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-slate-950" style={{ backgroundColor: average?.average_score ? SCORE_COLORS[Math.round(average.average_score)] : '#e2e8f0' }}>{average?.average_score != null ? `${average.average_score}/5` : t('meetings.leadership.notAssessed')}</span></div></div>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-900">{insight?.pattern || t('journey.trends.insufficientDomain')}</p>
          {(insight?.demonstrated || insight?.growth_edge || insight?.why_it_matters || insight?.next_experiment) && <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm leading-6 text-slate-700">
            {insight.demonstrated && <li><strong className="font-semibold text-slate-900">{t('journey.trends.demonstrated')}:</strong> {insight.demonstrated}</li>}
            {insight.growth_edge && <li><strong className="font-semibold text-slate-900">{t('journey.trends.growthEdge')}:</strong> {insight.growth_edge}</li>}
            {insight.why_it_matters && <li><strong className="font-semibold text-slate-900">{t('journey.trends.whyItMatters')}:</strong> {insight.why_it_matters}</li>}
            {insight.next_experiment && <li><strong className="font-semibold text-slate-900">{t('journey.trends.experiment')}:</strong> {insight.next_experiment}</li>}
          </ul>}
          {insight?.supporting_meetings?.length > 0 && <div className="mt-3 border-t border-slate-100 pt-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('journey.trends.supportingMeetings')}</p><div className="mt-2 flex flex-wrap gap-2">{insight.supporting_meetings.map((meeting) => <span key={meeting.meeting_id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{meeting.meeting_title}</span>)}</div></div>}
          {average?.assessment_count > 0 && <p className="mt-2 text-xs text-slate-500">{t('journey.trends.basedOn')} {average.assessment_count} {average.assessment_count === 1 ? t('journey.trends.assessment') : t('journey.trends.assessments')}</p>}
        </div>;
      })}</div>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"><h3 className="font-semibold text-emerald-950">{t('journey.trends.strengths')}</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-emerald-950">{(data.synthesis?.recurring_strengths || []).map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>)}</ul></div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-semibold text-amber-950">{t('journey.trends.growthEdges')}</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-amber-950">{(data.synthesis?.recurring_growth_edges || []).map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>)}</ul></div>
    </div>
    <div className="rounded-xl bg-slate-950 p-6 text-white shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">{t('journey.trends.nextFocus')}</p><p className="mt-3 max-w-4xl text-base leading-7 text-slate-100">{data.synthesis?.next_focus}</p></div>
  </section>;
}
