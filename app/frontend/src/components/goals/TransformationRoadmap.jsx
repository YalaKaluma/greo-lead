import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { isVision, isPillar, isOutcome } from '../../utils/goalTaxonomy';

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' }
];

const OUTCOME_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'done', label: 'Done' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'at_risk', label: 'At risk' },
  { value: 'blocked', label: 'Blocking issue' }
];

const OUTCOME_STATUS_STYLES = {
  not_started: {
    label: 'Not started',
    dot: 'bg-slate-300',
    card: 'border-slate-200 bg-slate-50 hover:bg-slate-100',
    wave: 'border-slate-200'
  },
  done: {
    label: 'Done',
    dot: 'bg-green-500',
    card: 'border-green-200 bg-green-50 hover:bg-green-100',
    wave: 'border-green-300'
  },
  ongoing: {
    label: 'Ongoing',
    dot: 'bg-blue-500',
    card: 'border-blue-200 bg-blue-50 hover:bg-blue-100',
    wave: 'border-blue-300'
  },
  at_risk: {
    label: 'At risk',
    dot: 'bg-orange-500',
    card: 'border-orange-200 bg-orange-50 hover:bg-orange-100',
    wave: 'border-orange-300'
  },
  blocked: {
    label: 'Blocking issue',
    dot: 'bg-red-500',
    card: 'border-red-200 bg-red-50 hover:bg-red-100',
    wave: 'border-red-300'
  }
};

const getOutcomeStatusStyle = (status) => (
  OUTCOME_STATUS_STYLES[status || 'not_started'] || OUTCOME_STATUS_STYLES.not_started
);

const getWaveStatusStyle = (wave) => {
  const statuses = (wave.goals || []).map(link => link.status || 'not_started');
  if (statuses.includes('blocked')) return OUTCOME_STATUS_STYLES.blocked;
  if (statuses.includes('at_risk')) return OUTCOME_STATUS_STYLES.at_risk;
  if (statuses.includes('ongoing')) return OUTCOME_STATUS_STYLES.ongoing;
  if (statuses.length > 0 && statuses.every(status => status === 'done')) return OUTCOME_STATUS_STYLES.done;
  return OUTCOME_STATUS_STYLES.not_started;
};

const getGoalTitle = (goal) => goal?.title || goal?.goal_text || '';

const emptyWaveForm = {
  title: '',
  description: '',
  status: 'not_started',
  target_start_date: '',
  target_end_date: ''
};

export default function TransformationRoadmap({
  apiUrl,
  userNumber,
  goals,
  selectedVisionId: lockedVisionId = null,
  waveModalRequest = 0,
  onWaveModalRequestHandled,
  roadmapGenerateRequest = 0,
  onRoadmapGenerateRequestHandled,
  onRoadmapChanged
}) {
  const visions = useMemo(() => goals.filter(isVision), [goals]);
  const [selectedVisionId, setSelectedVisionId] = useState('');
  const [roadmap, setRoadmap] = useState({ waves: [] });
  const [waveForm, setWaveForm] = useState(emptyWaveForm);
  const [showWaveModal, setShowWaveModal] = useState(false);
  const [editingWaveId, setEditingWaveId] = useState(null);
  const [editingWaveTitle, setEditingWaveTitle] = useState('');
  const [outcomeModalWave, setOutcomeModalWave] = useState(null);
  const [editingOutcomeLink, setEditingOutcomeLink] = useState(null);
  const [editingOutcomeForm, setEditingOutcomeForm] = useState({ title: '', goal_text: '', status: 'not_started' });
  const [selectedOutcomeId, setSelectedOutcomeId] = useState('');
  const [newOutcomeForm, setNewOutcomeForm] = useState({ title: '', description: '' });
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (lockedVisionId) {
      setSelectedVisionId(String(lockedVisionId));
      return;
    }
    if (!selectedVisionId && visions.length > 0) {
      setSelectedVisionId(String(visions[0].id));
    }
  }, [visions, selectedVisionId, lockedVisionId]);

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
      onRoadmapChanged?.();
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
      onWaveModalRequestHandled?.();
    }
  }, [waveModalRequest, onWaveModalRequestHandled]);

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
      setEditingWaveTitle('');
      setShowWaveModal(false);
      await fetchRoadmap();
    } catch (err) {
      console.error('Error saving wave:', err);
      setError('Could not save the wave.');
    }
  };

  const editWave = (wave) => {
    setEditingWaveId(wave.id);
    setEditingWaveTitle(wave.title || '');
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

  const reorderWaves = async (sourceIndex, destinationIndex) => {
    if (destinationIndex < 0 || destinationIndex >= (roadmap.waves || []).length) return;
    const waves = [...roadmap.waves];
    const [moved] = waves.splice(sourceIndex, 1);
    waves.splice(destinationIndex, 0, moved);
    setRoadmap(prev => ({ ...prev, waves }));
    await axios.patch(`${apiUrl}/api/journey/visions/${selectedVisionId}/waves/reorder`, {
      ordered_wave_ids: waves.map(wave => wave.id)
    }, { params: { user_number: userNumber } });
    onRoadmapChanged?.();
  };

  const reorderItems = (items, sourceIndex, destinationIndex) => {
    const nextItems = Array.from(items);
    const [movedItem] = nextItems.splice(sourceIndex, 1);
    nextItems.splice(destinationIndex, 0, movedItem);
    return nextItems;
  };

  const getWaveIdFromOutcomeDroppable = (droppableId) => (
    Number(String(droppableId).replace('wave-outcomes-', ''))
  );

  const persistWaveGoalOrder = async (waveId, orderedLinks) => {
    await axios.patch(`${apiUrl}/api/journey/waves/${waveId}/goals/reorder`, {
      ordered_goal_ids: orderedLinks.map(link => link.goal_id)
    }, { params: { user_number: userNumber } });
  };

  const moveOutcomeLink = async ({ source, destination }) => {
    const sourceWaveId = getWaveIdFromOutcomeDroppable(source.droppableId);
    const destinationWaveId = getWaveIdFromOutcomeDroppable(destination.droppableId);
    const sourceWave = (roadmap.waves || []).find(wave => wave.id === sourceWaveId);
    const destinationWave = (roadmap.waves || []).find(wave => wave.id === destinationWaveId);
    if (!sourceWave || !destinationWave) return;

    if (sourceWaveId === destinationWaveId) {
      const orderedLinks = reorderItems(sourceWave.goals || [], source.index, destination.index);
      setRoadmap(prev => ({
        ...prev,
        waves: (prev.waves || []).map(wave => (
          wave.id === sourceWaveId ? { ...wave, goals: orderedLinks } : wave
        ))
      }));
      await persistWaveGoalOrder(sourceWaveId, orderedLinks);
      await fetchRoadmap();
      return;
    }

    const sourceLinks = Array.from(sourceWave.goals || []);
    const destinationLinks = Array.from(destinationWave.goals || []);
    const [movedLink] = sourceLinks.splice(source.index, 1);
    if (!movedLink) return;
    destinationLinks.splice(destination.index, 0, movedLink);

    setRoadmap(prev => ({
      ...prev,
      waves: (prev.waves || []).map(wave => {
        if (wave.id === sourceWaveId) return { ...wave, goals: sourceLinks };
        if (wave.id === destinationWaveId) return { ...wave, goals: destinationLinks };
        return wave;
      })
    }));

    await axios.post(`${apiUrl}/api/journey/waves/${destinationWaveId}/goals`, {
      goal_id: movedLink.goal_id,
      sequence_order: destination.index,
      status: movedLink.status || 'not_started'
    }, { params: { user_number: userNumber } });

    await Promise.all([
      persistWaveGoalOrder(destinationWaveId, destinationLinks),
      sourceLinks.length > 0
        ? persistWaveGoalOrder(sourceWaveId, sourceLinks)
        : Promise.resolve()
    ]);
    await fetchRoadmap();
  };

  const handleRoadmapDragEnd = async (result) => {
    const { source, destination, type } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    try {
      if (type === 'WAVE') {
        await reorderWaves(source.index, destination.index);
        return;
      }

      if (type === 'OUTCOME') {
        await moveOutcomeLink({ source, destination });
      }
    } catch (err) {
      console.error('Error saving roadmap order:', err);
      setError('Could not save the new roadmap order.');
      await fetchRoadmap();
    }
  };

  const resetOutcomeModal = () => {
    setOutcomeModalWave(null);
    setSelectedOutcomeId('');
    setNewOutcomeForm({ title: '', description: '' });
  };

  const addExistingOutcomeToWave = async () => {
    const waveId = outcomeModalWave?.id;
    const goalId = selectedOutcomeId;
    if (!goalId) return;
    await axios.post(`${apiUrl}/api/journey/waves/${waveId}/goals`, {
      goal_id: Number(goalId),
      status: 'not_started'
    }, { params: { user_number: userNumber } });
    resetOutcomeModal();
    await fetchRoadmap();
  };

  const createAndAddOutcomeToWave = async () => {
    const waveId = outcomeModalWave?.id;
    const fallbackPillar = pillars[0];
    if (!waveId || !newOutcomeForm.title.trim()) return;
    if (!fallbackPillar) {
      setError('Create a pillar before adding a new outcome.');
      return;
    }

    const res = await axios.post(`${apiUrl}/api/journey/goals`, {
      title: newOutcomeForm.title,
      goal_text: newOutcomeForm.description || newOutcomeForm.title,
      why: '',
      time_horizon: 'outcome',
      parent_goal_id: fallbackPillar.id
    }, { params: { user_number: userNumber } });

    await axios.post(`${apiUrl}/api/journey/waves/${waveId}/goals`, {
      goal_id: res.data.id,
      status: 'not_started'
    }, { params: { user_number: userNumber } });

    resetOutcomeModal();
    await fetchRoadmap();
  };

  const removeOutcomeFromWave = async (waveId, goalId) => {
    await axios.delete(`${apiUrl}/api/journey/waves/${waveId}/goals/${goalId}`, {
      params: { user_number: userNumber }
    });
    setEditingOutcomeLink(null);
    setEditingOutcomeForm({ title: '', goal_text: '', status: 'not_started' });
    await fetchRoadmap();
    onRoadmapChanged?.();
  };

  const editOutcome = (wave, link) => {
    setEditingOutcomeLink({ wave, link });
    setEditingOutcomeForm({
      title: link.goal?.title || '',
      goal_text: link.goal?.goal_text || '',
      status: link.status || 'not_started'
    });
  };

  const saveOutcome = async () => {
    if (!editingOutcomeLink?.link?.goal_id || !editingOutcomeForm.title.trim()) return;
    await Promise.all([
      axios.put(`${apiUrl}/api/journey/goals/${editingOutcomeLink.link.goal_id}`, {
        title: editingOutcomeForm.title,
        goal_text: editingOutcomeForm.goal_text || editingOutcomeForm.title
      }, { params: { user_number: userNumber } }),
      axios.patch(`${apiUrl}/api/journey/waves/${editingOutcomeLink.wave.id}/goals/${editingOutcomeLink.link.goal_id}`, {
        status: editingOutcomeForm.status || 'not_started'
      }, { params: { user_number: userNumber } })
    ]);
    setEditingOutcomeLink(null);
    setEditingOutcomeForm({ title: '', goal_text: '', status: 'not_started' });
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

  useEffect(() => {
    if (roadmapGenerateRequest > 0) {
      generateRoadmap();
      onRoadmapGenerateRequestHandled?.();
    }
  }, [roadmapGenerateRequest, onRoadmapGenerateRequestHandled]);

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
  const waveCount = (roadmap.waves || []).length;
  const roadmapContentWidth = waveCount > 0
    ? `${waveCount * 320 + Math.max(waveCount - 1, 0) * 40}px`
    : undefined;

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

      {!lockedVisionId && (
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
        </div>
      )}

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

      {selectedVision && (
        <div
          className="rounded-lg border border-slate-200 bg-white p-4"
          style={{ width: roadmapContentWidth }}
        >
          <h2 className="text-xl font-semibold text-slate-900 break-words">
            {getGoalTitle(selectedVision)}
          </h2>
          <div className="mt-2 text-xs text-slate-500">Vision</div>
        </div>
      )}

      <DragDropContext onDragEnd={handleRoadmapDragEnd}>
        <Droppable droppableId="roadmap-waves" direction="horizontal" type="WAVE">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="flex gap-10 overflow-x-auto pb-3"
            >
              {(roadmap.waves || []).map((wave, index) => (
                <Draggable key={wave.id} draggableId={String(wave.id)} index={index}>
                  {(provided, snapshot) => {
                    const waveStyle = getWaveStatusStyle(wave);

                    return (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        style={provided.draggableProps.style}
                        onClick={() => editWave(wave)}
                        className={`relative min-w-[300px] lg:min-w-[320px] max-w-[340px] border-2 ${waveStyle.wave} rounded-lg bg-white p-4 cursor-pointer ${
                          snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-300' : ''
                        }`}
                      >
                        {index < (roadmap.waves || []).length - 1 && (
                          <div className="hidden lg:flex absolute -right-10 top-16 w-10 items-center pointer-events-none">
                            <div className="h-px flex-1 bg-slate-500" />
                            <div className="h-2 w-2 rotate-45 border-r border-t border-slate-500" />
                          </div>
                        )}

                        <div className="min-w-0" {...provided.dragHandleProps}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Wave {index + 1}</div>
                            <span className={`h-3 w-3 rounded-full ${waveStyle.dot}`} title={waveStyle.label} />
                          </div>
                          <h3 className="text-lg font-semibold text-slate-900 break-words">{wave.title}</h3>
                          {wave.description && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap break-words">{wave.description}</p>}
                          <div className="mt-2 text-xs text-slate-500">{STATUS_OPTIONS.find(option => option.value === wave.status)?.label || wave.status}</div>
                        </div>

                        <Droppable droppableId={`wave-outcomes-${wave.id}`} type="OUTCOME">
                          {(provided, snapshot) => (
                            <div
                              {...provided.droppableProps}
                              ref={provided.innerRef}
                              className={`mt-4 min-h-[48px] space-y-2 rounded-md transition-colors ${
                                snapshot.isDraggingOver ? 'bg-blue-50/70' : ''
                              }`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {(wave.goals || []).map((link, linkIndex) => {
                                const outcomeStyle = getOutcomeStatusStyle(link.status);

                                return (
                                  <Draggable key={link.id} draggableId={`wave-goal-${link.id}`} index={linkIndex}>
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        style={provided.draggableProps.style}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          editOutcome(wave, link);
                                        }}
                                        className={`${outcomeStyle.card} border rounded p-3 cursor-pointer ${
                                          snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-200' : ''
                                        }`}
                                      >
                                        <div className="flex items-start gap-2">
                                          <span
                                            {...provided.dragHandleProps}
                                            onClick={(event) => event.stopPropagation()}
                                            className="mt-0.5 select-none rounded px-1 text-slate-400 hover:bg-white/70 hover:text-slate-700 cursor-grab active:cursor-grabbing"
                                            aria-label="Move outcome"
                                            title="Drag to reorder"
                                          >
                                            ::
                                          </span>
                                          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${outcomeStyle.dot}`} />
                                          <div className="min-w-0 flex-1">
                                            <div className="font-medium text-slate-800 break-words">{link.goal?.title || link.goal?.goal_text}</div>
                                            <div className="mt-1 text-xs text-slate-500">{outcomeStyle.label}</div>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </Draggable>
                                );
                              })}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>

                        <div className="mt-4 flex justify-start">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setOutcomeModalWave(wave);
                            }}
                            className="h-8 w-8 rounded-full border border-slate-300 hover:border-blue-500 hover:text-blue-600 text-slate-600 text-lg leading-none"
                            aria-label="Add outcome"
                            title="Add outcome"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  }}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

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
              setEditingWaveTitle('');
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
                  setEditingWaveTitle('');
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
                  setEditingWaveTitle('');
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
            {editingWaveId && (
              <div className="px-6 pb-4">
                <button
                  onClick={() => deleteWave(editingWaveId)}
                  className="w-full px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-medium transition-colors border border-red-200"
                >
                  Delete {editingWaveTitle || 'Wave'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {outcomeModalWave && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) resetOutcomeModal();
          }}
        >
          <div className="bg-white rounded-xl max-w-xl w-full shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-800">Add Outcome</h3>
              <button onClick={resetOutcomeModal} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Existing outcome</label>
                <div className="flex gap-2">
                  <select
                    value={selectedOutcomeId}
                    onChange={(event) => setSelectedOutcomeId(event.target.value)}
                    className="min-w-0 flex-1 px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="">Select outcome...</option>
                    {availableOutcomes.map(outcome => (
                      <option key={outcome.id} value={outcome.id}>{outcome.title || outcome.goal_text}</option>
                    ))}
                  </select>
                  <button onClick={addExistingOutcomeToWave} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                    Add
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-5 space-y-3">
                <label className="block text-sm font-medium text-slate-700">New outcome</label>
                <input
                  value={newOutcomeForm.title}
                  onChange={(event) => setNewOutcomeForm(prev => ({ ...prev, title: event.target.value }))}
                  placeholder="Outcome title"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
                <textarea
                  value={newOutcomeForm.description}
                  onChange={(event) => setNewOutcomeForm(prev => ({ ...prev, description: event.target.value }))}
                  placeholder="Description"
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
              <button onClick={resetOutcomeModal} className="flex-1 px-4 py-3 border-2 border-slate-300 hover:border-slate-400 text-slate-700 rounded-lg font-medium transition-colors">
                Cancel
              </button>
              <button onClick={createAndAddOutcomeToWave} className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                Create Outcome
              </button>
            </div>
          </div>
        </div>
      )}

      {editingOutcomeLink && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setEditingOutcomeLink(null);
              setEditingOutcomeForm({ title: '', goal_text: '', status: 'not_started' });
            }
          }}
        >
          <div className="bg-white rounded-xl max-w-xl w-full shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-800">Edit Outcome</h3>
              <button
                onClick={() => {
                  setEditingOutcomeLink(null);
                  setEditingOutcomeForm({ title: '', goal_text: '', status: 'not_started' });
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
                value={editingOutcomeForm.title}
                onChange={(event) => setEditingOutcomeForm(prev => ({ ...prev, title: event.target.value }))}
                placeholder="Outcome title"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                autoFocus
              />
              <textarea
                value={editingOutcomeForm.goal_text}
                onChange={(event) => setEditingOutcomeForm(prev => ({ ...prev, goal_text: event.target.value }))}
                placeholder="Description"
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg resize-none"
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
                <select
                  value={editingOutcomeForm.status}
                  onChange={(event) => setEditingOutcomeForm(prev => ({ ...prev, status: event.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  {OUTCOME_STATUS_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => {
                  setEditingOutcomeLink(null);
                  setEditingOutcomeForm({ title: '', goal_text: '', status: 'not_started' });
                }}
                className="flex-1 px-4 py-3 border-2 border-slate-300 hover:border-slate-400 text-slate-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button onClick={saveOutcome} className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                Save Outcome
              </button>
            </div>
            <div className="px-6 pb-4">
              <button
                onClick={() => removeOutcomeFromWave(editingOutcomeLink.wave.id, editingOutcomeLink.link.goal_id)}
                className="w-full px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-medium transition-colors border border-red-200"
              >
                Remove from Wave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
