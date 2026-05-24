import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { isVision, isPillar, isOutcome } from '../../utils/goalTaxonomy';

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' }
];

const emptyWaveForm = {
  title: '',
  description: '',
  status: 'not_started',
  target_start_date: '',
  target_end_date: ''
};

export default function TransformationRoadmap({ apiUrl, userNumber, goals, waveModalRequest = 0 }) {
  const visions = useMemo(() => goals.filter(isVision), [goals]);
  const [selectedVisionId, setSelectedVisionId] = useState('');
  const [roadmap, setRoadmap] = useState({ waves: [] });
  const [waveForm, setWaveForm] = useState(emptyWaveForm);
  const [showWaveModal, setShowWaveModal] = useState(false);
  const [editingWaveId, setEditingWaveId] = useState(null);
  const [selectedOutcomeByWave, setSelectedOutcomeByWave] = useState({});
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedVisionId && visions.length > 0) {
      setSelectedVisionId(String(visions[0].id));
    }
  }, [visions, selectedVisionId]);

  const selectedVision = visions.find(vision => String(vision.id) === String(selectedVisionId));

  const pillars = useMemo(() => (
    goals.filter(goal => isPillar(goal) && goal.parent_goal_id === selectedVision?.id)
  ), [goals, selectedVision]);

  const pillarIds = useMemo(() => new Set(pillars.map(pillar => pillar.id)), [pillars]);

  const outcomes = useMemo(() => (
    goals.filter(goal => isOutcome(goal) && pillarIds.has(goal.parent_goal_id))
  ), [goals, pillarIds]);

  const linkedOutcomeIds = useMemo(() => new Set(
    (roadmap.waves || []).flatMap(wave => (wave.goals || []).map(link => link.goal_id))
  ), [roadmap]);

  const fetchRoadmap = async () => {
    if (!selectedVisionId) return;
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${apiUrl}/api/journey/visions/${selectedVisionId}/roadmap`, {
        params: { user_number: userNumber }
      });
      setRoadmap(res.data || { waves: [] });
    } catch (err) {
      console.error('Error fetching roadmap:', err);
      setError('Could not load the roadmap.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoadmap();
  }, [selectedVisionId]);

  useEffect(() => {
    if (waveModalRequest > 0) {
      setEditingWaveId(null);
      setWaveForm(emptyWaveForm);
      setShowWaveModal(true);
    }
  }, [waveModalRequest]);

  const saveWave = async () => {
    if (!selectedVisionId || !waveForm.title.trim()) return;
    const payload = {
      ...waveForm,
      target_start_date: waveForm.target_start_date || null,
      target_end_date: waveForm.target_end_date || null
    };

    try {
      if (editingWaveId) {
        await axios.patch(`${apiUrl}/api/journey/waves/${editingWaveId}`, payload, {
          params: { user_number: userNumber }
        });
      } else {
        await axios.post(`${apiUrl}/api/journey/visions/${selectedVisionId}/waves`, payload, {
          params: { user_number: userNumber }
        });
      }
      setWaveForm(emptyWaveForm);
      setEditingWaveId(null);
      setShowWaveModal(false);
      await fetchRoadmap();
    } catch (err) {
      console.error('Error saving wave:', err);
      setError('Could not save the wave.');
    }
  };

  const editWave = (wave) => {
    setEditingWaveId(wave.id);
    setWaveForm({
      title: wave.title || '',
      description: wave.description || '',
      status: wave.status || 'not_started',
      target_start_date: wave.target_start_date || '',
      target_end_date: wave.target_end_date || ''
    });
    setShowWaveModal(true);
  };

  const deleteWave = async (waveId) => {
    if (!confirm('Delete this wave? Linked outcomes will remain in Goal Setting.')) return;
    await axios.delete(`${apiUrl}/api/journey/waves/${waveId}`, {
      params: { user_number: userNumber }
    });
    await fetchRoadmap();
  };

  const reorderWaves = async (sourceIndex, direction) => {
    const waves = [...roadmap.waves];
    const destinationIndex = sourceIndex + direction;
    if (destinationIndex < 0 || destinationIndex >= waves.length) return;
    const [moved] = waves.splice(sourceIndex, 1);
    waves.splice(destinationIndex, 0, moved);
    setRoadmap(prev => ({ ...prev, waves }));
    await axios.patch(`${apiUrl}/api/journey/visions/${selectedVisionId}/waves/reorder`, {
      ordered_wave_ids: waves.map(wave => wave.id)
    }, { params: { user_number: userNumber } });
  };

  const addOutcomeToWave = async (waveId) => {
    const goalId = selectedOutcomeByWave[waveId];
    if (!goalId) return;
    await axios.post(`${apiUrl}/api/journey/waves/${waveId}/goals`, {
      goal_id: Number(goalId)
    }, { params: { user_number: userNumber } });
    setSelectedOutcomeByWave(prev => ({ ...prev, [waveId]: '' }));
    await fetchRoadmap();
  };

  const removeOutcomeFromWave = async (waveId, goalId) => {
    await axios.delete(`${apiUrl}/api/journey/waves/${waveId}/goals/${goalId}`, {
      params: { user_number: userNumber }
    });
    await fetchRoadmap();
  };

  const moveOutcome = async (fromWaveId, toWaveId, goalId) => {
    if (!toWaveId || Number(toWaveId) === Number(fromWaveId)) return;
    await axios.delete(`${apiUrl}/api/journey/waves/${fromWaveId}/goals/${goalId}`, {
      params: { user_number: userNumber }
    });
    await axios.post(`${apiUrl}/api/journey/waves/${toWaveId}/goals`, {
      goal_id: goalId
    }, { params: { user_number: userNumber } });
    await fetchRoadmap();
  };

  const generateRoadmap = async () => {
    setLoading(true);
    setDraft(null);
    setError('');
    try {
      const res = await axios.post(`${apiUrl}/api/journey/visions/${selectedVisionId}/generate-roadmap`, {}, {
        params: { user_number: userNumber }
      });
      setDraft({
        ...res.data,
        waves: (res.data?.waves || []).map(wave => ({ ...wave, selected: true }))
      });
    } catch (err) {
      console.error('Error generating roadmap:', err);
      setError('Alfred could not generate a roadmap draft.');
    } finally {
      setLoading(false);
    }
  };

  const saveDraft = async () => {
    for (const wave of (draft?.waves || []).filter(item => item.selected !== false)) {
      const created = await axios.post(`${apiUrl}/api/journey/visions/${selectedVisionId}/waves`, {
        title: wave.title,
        description: `${wave.description || ''}${wave.rationale ? `\n\nRationale: ${wave.rationale}` : ''}`,
        status: 'not_started'
      }, { params: { user_number: userNumber } });

      for (const goalId of wave.suggested_goal_ids || []) {
        await axios.post(`${apiUrl}/api/journey/waves/${created.data.id}/goals`, {
          goal_id: goalId
        }, { params: { user_number: userNumber } });
      }
    }
    setDraft(null);
    await fetchRoadmap();
  };

  const updateDraftWave = (index, field, value) => {
    setDraft(current => ({
      ...current,
      waves: (current?.waves || []).map((wave, waveIndex) => (
        waveIndex === index ? { ...wave, [field]: value } : wave
      ))
    }));
  };

  const availableOutcomes = outcomes.filter(outcome => !linkedOutcomeIds.has(outcome.id));

  if (visions.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-50 border border-slate-200 rounded-lg">
        <p className="text-slate-600">Create a Vision first, then build its transformation roadmap.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700 mb-2">Vision</label>
          <select
            value={selectedVisionId}
            onChange={(event) => setSelectedVisionId(event.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          >
            {visions.map(vision => (
              <option key={vision.id} value={vision.id}>
                {vision.title || vision.goal_text}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={generateRoadmap}
          disabled={loading}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium disabled:opacity-60"
        >
          Generate Roadmap with Alfred
        </button>
      </div>

      {draft && (
        <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900">Alfred Draft Roadmap</h3>
            <div className="flex gap-2">
              <button onClick={saveDraft} className="px-3 py-2 bg-blue-600 text-white rounded-lg">Save selected waves</button>
              <button onClick={() => setDraft(null)} className="px-3 py-2 border border-blue-300 rounded-lg text-blue-800">Cancel</button>
            </div>
          </div>
          <div className="space-y-3">
            {(draft.waves || []).map((wave, index) => (
              <div key={`${wave.title}-${index}`} className="bg-white border border-blue-100 rounded p-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-2">
                  <input
                    type="checkbox"
                    checked={wave.selected !== false}
                    onChange={(event) => updateDraftWave(index, 'selected', event.target.checked)}
                  />
                  Draft wave {wave.sequence_order}
                </label>
                <input
                  value={wave.title || ''}
                  onChange={(event) => updateDraftWave(index, 'title', event.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium text-slate-900"
                />
                <textarea
                  value={wave.description || ''}
                  onChange={(event) => updateDraftWave(index, 'description', event.target.value)}
                  rows={2}
                  className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700"
                />
                {wave.rationale && <p className="text-xs text-slate-500 mt-2">{wave.rationale}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="text-center py-6 text-slate-500">Loading roadmap...</div>}

      <div className="flex gap-4 overflow-x-auto pb-3">
        {(roadmap.waves || []).map((wave, index) => (
          <div key={wave.id} className="min-w-[320px] lg:min-w-[360px] max-w-[380px] flex-1 border border-slate-200 rounded-lg bg-white p-4">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Wave {index + 1}</div>
                <h3 className="text-lg font-semibold text-slate-900">{wave.title}</h3>
                {wave.description && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{wave.description}</p>}
                <div className="mt-2 text-xs text-slate-500">{STATUS_OPTIONS.find(option => option.value === wave.status)?.label || wave.status}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => reorderWaves(index, -1)} className="px-2 py-1 border border-slate-300 rounded text-sm">Left</button>
                <button onClick={() => reorderWaves(index, 1)} className="px-2 py-1 border border-slate-300 rounded text-sm">Right</button>
                <button onClick={() => editWave(wave)} className="px-2 py-1 border border-slate-300 rounded text-sm">Edit</button>
                <button onClick={() => deleteWave(wave.id)} className="px-2 py-1 border border-red-200 text-red-600 rounded text-sm">Delete</button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {(wave.goals || []).map(link => (
                <div key={link.id} className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded p-3">
                  <div className="font-medium text-slate-800">{link.goal?.title || link.goal?.goal_text}</div>
                  <div className="flex gap-2">
                    <select
                      onChange={(event) => moveOutcome(wave.id, event.target.value, link.goal_id)}
                      value=""
                      className="px-2 py-1 border border-slate-300 rounded text-sm"
                    >
                      <option value="">Move to...</option>
                      {(roadmap.waves || []).filter(other => other.id !== wave.id).map(other => (
                        <option key={other.id} value={other.id}>{other.title}</option>
                      ))}
                    </select>
                    <button onClick={() => removeOutcomeFromWave(wave.id, link.goal_id)} className="px-2 py-1 border border-slate-300 rounded text-sm">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-2">
              <select
                value={selectedOutcomeByWave[wave.id] || ''}
                onChange={(event) => setSelectedOutcomeByWave(prev => ({ ...prev, [wave.id]: event.target.value }))}
                className="px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="">Add existing outcome...</option>
                {availableOutcomes.map(outcome => (
                  <option key={outcome.id} value={outcome.id}>{outcome.title || outcome.goal_text}</option>
                ))}
              </select>
              <button onClick={() => addOutcomeToWave(wave.id)} className="px-3 py-2 border border-slate-300 rounded-lg text-slate-700">
                Add Outcome
              </button>
            </div>
          </div>
        ))}
      </div>

      {!loading && (roadmap.waves || []).length === 0 && (
        <div className="text-center py-10 bg-slate-50 border border-slate-200 rounded-lg">
          <p className="text-slate-600">No waves yet. Add a wave or ask Alfred to draft the transformation plan.</p>
        </div>
      )}

      {showWaveModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowWaveModal(false);
              setEditingWaveId(null);
              setWaveForm(emptyWaveForm);
            }
          }}
        >
          <div className="bg-white rounded-xl max-w-xl w-full shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-800">{editingWaveId ? 'Edit Wave' : 'Create Wave'}</h3>
              <button
                onClick={() => {
                  setShowWaveModal(false);
                  setEditingWaveId(null);
                  setWaveForm(emptyWaveForm);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <input
                value={waveForm.title}
                onChange={(event) => setWaveForm(prev => ({ ...prev, title: event.target.value }))}
                placeholder="Wave title"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                autoFocus
              />
              <textarea
                value={waveForm.description}
                onChange={(event) => setWaveForm(prev => ({ ...prev, description: event.target.value }))}
                placeholder="Focus or description"
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg resize-none"
              />
              <select
                value={waveForm.status}
                onChange={(event) => setWaveForm(prev => ({ ...prev, status: event.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => {
                  setShowWaveModal(false);
                  setEditingWaveId(null);
                  setWaveForm(emptyWaveForm);
                }}
                className="flex-1 px-4 py-3 border-2 border-slate-300 hover:border-slate-400 text-slate-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button onClick={saveWave} className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                {editingWaveId ? 'Save Wave' : 'Create Wave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
