import React, { useEffect, useState } from 'react';
import axios from 'axios';

const STAGE_KEYS = ['evidence_foundation', 'executive_world', 'behavioral_profile', 'dynamic_state'];
const ENTITY_TYPES = ['person', 'team', 'project', 'workstream', 'goal'];
const ACTIVE_STATUSES = ['queued', 'running'];

const translateWith = (t, key, variables) => Object.entries(variables).reduce(
  (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
  t(key)
);

function MetricCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value ?? '—'}</p>
    </div>
  );
}

function ActivityFeed({ activity, t }) {
  const rows = [...(activity || [])].reverse().slice(0, 12);
  if (rows.length === 0) return null;
  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-slate-950">{t('settings.twinPipeline.activity.title')}</h4>
      <div className="mt-3 space-y-3">
        {rows.map((item, index) => {
          const fallback = (item.event || '').replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
          const details = item.details || {};
          const count = details.current && details.total ? `${details.current} / ${details.total}` : null;
          const findings = details.claims_found ?? details.candidate_count ?? details.assertion_count;
          return (
            <div key={`${item.at}-${item.event}-${index}`} className="flex gap-3 text-sm">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium text-slate-800">{t(`settings.twinPipeline.activity.${item.event}`, fallback)}</p>
                  <time className="text-xs text-slate-400">{item.at ? new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</time>
                </div>
                {(count || findings !== undefined) && <p className="mt-0.5 text-xs text-slate-500">{[count, findings !== undefined ? translateWith(t, 'settings.twinPipeline.activity.findings', { count: findings }) : null].filter(Boolean).join(' · ')}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StageOutput({ stage, pipeline, model, activeEntityType, setActiveEntityType, t }) {
  const output = stage?.output || {};
  const metrics = stage?.metrics || {};
  if (stage?.status !== 'completed') {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center">
        <p className="font-semibold text-slate-900">{t(`settings.twinPipeline.output.${stage?.status || 'locked'}.title`)}</p>
        <p className="mt-2 text-sm text-slate-500">{t(`settings.twinPipeline.output.${stage?.status || 'locked'}.description`)}</p>
      </div>
    );
  }

  if (stage.stage_key === 'evidence_foundation') {
    const sources = Object.entries(output.source_counts || {}).sort((a, b) => b[1] - a[1]);
    const tags = Object.entries(output.tag_counts || {}).sort((a, b) => b[1] - a[1]);
    return (
      <div className="mt-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label={t('settings.twinPipeline.metric.evidence')} value={metrics.evidence_count} />
          <MetricCard label={t('settings.twinPipeline.metric.sources')} value={metrics.source_count} />
          <MetricCard label={t('settings.twinPipeline.metric.tagged')} value={metrics.tagged_evidence_count} />
          <MetricCard label={t('settings.twinPipeline.metric.coverage')} value={`${output.coverage_percent || 0}%`} />
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <section>
            <h4 className="text-sm font-semibold text-slate-950">{t('settings.twinPipeline.sources.title')}</h4>
            <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4">
              {sources.slice(0, 15).map(([name, count]) => <div key={name} className="flex justify-between gap-4 py-2.5 text-sm"><span className="text-slate-700">{name.replaceAll('_', ' ')}</span><span className="font-semibold text-slate-950">{count}</span></div>)}
            </div>
          </section>
          <section>
            <h4 className="text-sm font-semibold text-slate-950">{t('settings.twinPipeline.tags.title')}</h4>
            <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4">
              {tags.map(([name, count]) => <div key={name} className="flex justify-between gap-4 py-2.5 text-sm"><span className="text-slate-700">{t(`settings.twinPipeline.entity.${name}`)}</span><span className="font-semibold text-slate-950">{count}</span></div>)}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (stage.stage_key === 'executive_world') {
    const entities = (pipeline?.executive_world?.entities || []).filter((item) => item.entity_type === activeEntityType);
    return (
      <div className="mt-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label={t('settings.twinPipeline.entity.person')} value={metrics.person_count || 0} />
          <MetricCard label={t('settings.twinPipeline.entity.project')} value={(metrics.project_count || 0) + (metrics.workstream_count || 0)} />
          <MetricCard label={t('settings.twinPipeline.entity.goal')} value={metrics.goal_count || 0} />
          <MetricCard label={t('settings.twinPipeline.metric.relationships')} value={metrics.relationship_count || 0} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label={t('settings.twinPipeline.world.tabsLabel')}>
          {ENTITY_TYPES.map((type) => (
            <button key={type} type="button" role="tab" aria-selected={activeEntityType === type} onClick={() => setActiveEntityType(type)}
              className={`rounded-full border px-3 py-2 text-sm font-semibold ${activeEntityType === type ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
              {t(`settings.twinPipeline.entity.${type}`)} ({(pipeline?.executive_world?.entities || []).filter((item) => item.entity_type === type).length})
            </button>
          ))}
        </div>
        {entities.length === 0 ? (
          <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">{t('settings.twinPipeline.world.empty')}</p>
        ) : (
          <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-5">
            {entities.map((entity) => (
              <article key={entity.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h4 className="font-semibold text-slate-950">{entity.display_name}</h4><p className="mt-1 text-sm leading-6 text-slate-600">{entity.summary || t('settings.twinPipeline.world.noSummary')}</p></div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{entity.evidence_count} {t('settings.twinPipeline.metric.evidence').toLowerCase()}</span>
                </div>
                {(entity.first_seen_at || entity.last_seen_at) && <p className="mt-2 text-xs text-slate-400">{t('settings.twinPipeline.world.observed')}: {entity.first_seen_at ? new Date(entity.first_seen_at).toLocaleDateString() : '—'} → {entity.last_seen_at ? new Date(entity.last_seen_at).toLocaleDateString() : '—'}</p>}
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (stage.stage_key === 'behavioral_profile') {
    const dimensions = model?.core_twin?.dimensions || output.core_twin?.dimensions || {};
    return (
      <div className="mt-6">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
          <h4 className="font-semibold text-blue-950">{t('settings.executiveModel.core.title')}</h4>
          <p className="mt-2 text-sm leading-6 text-blue-900">{model?.core_twin?.overview || output.core_twin?.overview || t('settings.executiveModel.core.noFinding')}</p>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {Object.entries(dimensions).map(([key, value]) => (
            <section key={key} className="rounded-xl border border-slate-200 bg-white p-5">
              <h4 className="text-sm font-semibold text-slate-950">{t(`settings.executiveModel.dimension.${key}`)}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-700">{value}</p>
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard label={t('settings.twinPipeline.metric.recentEvidence')} value={metrics.recent_evidence_count || 0} />
        <MetricCard label={t('settings.twinPipeline.metric.activeContexts')} value={metrics.active_context_count || 0} />
        <MetricCard label={t('settings.twinPipeline.metric.currentFindings')} value={metrics.current_finding_count || 0} />
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section><h4 className="text-sm font-semibold text-slate-950">{t('settings.twinPipeline.state.contexts')}</h4><div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4">{(output.active_contexts || []).map((item) => <div key={item.label} className="flex justify-between gap-4 py-2.5 text-sm"><span>{item.label.replace(':', ' · ')}</span><span className="font-semibold">{item.evidence_count}</span></div>)}</div></section>
        <section><h4 className="text-sm font-semibold text-slate-950">{t('settings.twinPipeline.state.findings')}</h4><div className="mt-2 space-y-3">{(output.current_findings || []).map((item) => <article key={item.claim_id} className="rounded-xl border border-slate-200 bg-white p-4"><h5 className="text-sm font-semibold text-slate-950">{item.title}</h5><p className="mt-1 text-sm leading-6 text-slate-600">{item.statement}</p></article>)}</div></section>
      </div>
    </div>
  );
}

export default function DigitalTwinPipeline({ apiUrl, t }) {
  const [pipeline, setPipeline] = useState(null);
  const [model, setModel] = useState(null);
  const [activeStageKey, setActiveStageKey] = useState('evidence_foundation');
  const [activeEntityType, setActiveEntityType] = useState('person');
  const [analysisWeeks, setAnalysisWeeks] = useState(52);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [pipelineResponse, modelResponse] = await Promise.all([
        axios.get(`${apiUrl}/api/intelligence/twin/pipeline`),
        axios.get(`${apiUrl}/api/intelligence/model`)
      ]);
      const nextPipeline = pipelineResponse.data || null;
      setPipeline(nextPipeline);
      setModel(modelResponse.data || null);
      const running = nextPipeline?.stages?.find((stage) => ACTIVE_STATUSES.includes(stage.status));
      if (running) setActiveStageKey(running.stage_key);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || t('settings.twinPipeline.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [apiUrl]);
  const stages = pipeline?.stages || [];
  const activeStage = stages.find((stage) => stage.stage_key === activeStageKey) || stages[0];
  const hasRunningStage = stages.some((stage) => ACTIVE_STATUSES.includes(stage.status));

  useEffect(() => {
    if (!hasRunningStage) return undefined;
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [hasRunningStage, apiUrl]);

  const runStage = async () => {
    if (!activeStage) return;
    setStarting(true);
    setError('');
    try {
      const body = activeStage.stage_key === 'evidence_foundation' ? { weeks: analysisWeeks } : {};
      const response = await axios.post(`${apiUrl}/api/intelligence/twin/stages/${activeStage.stage_key}/run`, body);
      setPipeline((current) => ({ ...current, stages: (current?.stages || []).map((stage) => stage.stage_key === activeStage.stage_key ? response.data : stage) }));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || t('settings.twinPipeline.startError'));
    } finally {
      setStarting(false);
    }
  };

  const completedCount = pipeline?.completed_count || 0;
  const progressWidth = `${Math.round((completedCount / STAGE_KEYS.length) * 100)}%`;
  const actionLabel = activeStage?.status === 'failed'
    ? t('settings.twinPipeline.action.resume')
    : activeStage?.status === 'completed'
      ? t('settings.twinPipeline.action.rebuild')
      : t('settings.twinPipeline.action.start');

  if (loading) return <p className="py-8 text-sm text-slate-500">{t('settings.twinPipeline.loading')}</p>;

  return (
    <section className="py-8">
      <div className="max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="text-lg font-semibold text-slate-950">{t('settings.executiveModel.title')}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{t('settings.twinPipeline.description')}</p></div>
          <div className="w-full sm:w-60"><p className="text-sm font-semibold text-slate-800">{translateWith(t, 'settings.twinPipeline.overall', { completed: completedCount, total: STAGE_KEYS.length })}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={t('settings.twinPipeline.overallLabel')} aria-valuemin="0" aria-valuemax="4" aria-valuenow={completedCount}><div className="h-full bg-blue-600 transition-all" style={{ width: progressWidth }} /></div></div>
        </div>
        {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}

        <div className="mt-7 grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <nav className="space-y-2" aria-label={t('settings.twinPipeline.stagesLabel')}>
            {stages.map((stage) => {
              const selected = activeStage?.stage_key === stage.stage_key;
              return <button key={stage.stage_key} type="button" disabled={stage.status === 'locked'} onClick={() => setActiveStageKey(stage.stage_key)} className={`w-full rounded-xl border p-4 text-left transition ${selected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60`}>
                <div className="flex items-center gap-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${stage.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : selected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{stage.status === 'completed' ? '✓' : stage.stage_order}</span><div className="min-w-0"><p className="font-semibold text-slate-950">{t(`settings.twinPipeline.stage.${stage.stage_key}.title`)}</p><p className="mt-0.5 text-xs text-slate-500">{t(`settings.twinPipeline.status.${stage.status}`)}</p></div></div>
                <p className="mt-3 text-xs leading-5 text-slate-500">{t(`settings.twinPipeline.stage.${stage.stage_key}.short`)}</p>
              </button>;
            })}
            <p className="rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">{t('settings.twinPipeline.gateHint')}</p>
          </nav>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{translateWith(t, 'settings.twinPipeline.stageLabel', { number: activeStage?.stage_order || 1 })}</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-950">{t(`settings.twinPipeline.stage.${activeStage?.stage_key}.title`)}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t(`settings.twinPipeline.stage.${activeStage?.stage_key}.description`)}</p>

            {activeStage?.stage_key === 'evidence_foundation' && activeStage.status !== 'running' && activeStage.status !== 'queued' && (
              <label className="mt-5 block max-w-md text-sm font-semibold text-slate-800">{t('settings.executiveModel.analysisWindow')}: {analysisWeeks} {t('settings.executiveModel.weeks')}<input type="range" min="1" max="520" value={analysisWeeks} onChange={(event) => setAnalysisWeeks(Number(event.target.value))} className="mt-2 w-full" /></label>
            )}

            {ACTIVE_STATUSES.includes(activeStage?.status) && <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4"><div className="flex justify-between gap-4 text-sm"><div><p className="font-semibold text-blue-950">{t('settings.twinPipeline.running')}</p>{activeStage.progress_total > 0 && <p className="mt-1 text-xs text-blue-700">{activeStage.progress_current} / {activeStage.progress_total}</p>}</div><span className="font-semibold text-blue-800">{activeStage.progress_percent}%</span></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-blue-100"><div className="h-full bg-blue-600 transition-all" style={{ width: `${activeStage.progress_percent || 0}%` }} /></div></div>}
            {activeStage?.status === 'failed' && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p>{activeStage.error_message || t('settings.twinPipeline.failed')}</p>{activeStage.failure_reference && <p className="mt-1 text-xs">{t('settings.executiveModel.failureReference')}: {activeStage.failure_reference}</p>}</div>}

            <ActivityFeed activity={activeStage?.activity_log} t={t} />

            <StageOutput stage={activeStage} pipeline={pipeline} model={model} activeEntityType={activeEntityType} setActiveEntityType={setActiveEntityType} t={t} />

            {activeStage?.can_run && !hasRunningStage && <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">{activeStage.status === 'completed' ? t('settings.twinPipeline.rebuildWarning') : t('settings.twinPipeline.readyHint')}</p><button type="button" onClick={runStage} disabled={starting} className="rounded-md bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300">{starting ? t('settings.executiveModel.starting') : actionLabel}</button></div>}
          </div>
        </div>
      </div>
    </section>
  );
}
