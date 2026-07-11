import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useLanguage } from '../i18n/LanguageContext';
import MyCoachingSessions from './MyCoachingSessions';

const PEOPLE_REVIEW_SESSION_TYPES = ['people_review'];
const PEOPLE_REVIEW_EMPTY_STATE = 'Start a people review session to reflect on the current relationship, diagnose patterns, and choose concrete next steps.';

const CIRCLE = {
  NONE: '',
  LEADERSHIP: 'leadership_circle',
  SPONSOR: 'sponsor_circle'
};

const tabs = [
  ['overview', 'team.tabs.overview', 'Overview'],
  ['leadership', 'team.tabs.leadership', 'Leadership Circle'],
  ['sponsor', 'team.tabs.sponsor', 'Sponsor Circle'],
  ['team', 'team.tabs.fullTeam', 'Full Team'],
  ['stakeholders', 'team.tabs.stakeholders', 'Stakeholders'],
  ['notes', 'team.tabs.notes', 'Relationship Reviews / Notes']
];

const relationshipStrategies = [
  'Build trust',
  'Keep informed',
  'Seek sponsorship',
  'Challenge constructively',
  'Align priorities',
  'Create quick win',
  'Ask for feedback',
  'Escalate carefully',
  'Reduce friction',
  'Maintain relationship'
];

const relationshipHealthOptions = [
  { value: 1, key: 'team.healthExcellent', label: 'Excellent' },
  { value: 2, key: 'team.healthStrong', label: 'Strong' },
  { value: 3, key: 'team.healthNeutral', label: 'Neutral' },
  { value: 4, key: 'team.healthTense', label: 'Tense' },
  { value: 5, key: 'team.healthToxic', label: 'Toxic' }
];

const performanceOptions = [
  { value: 'Superstar', key: 'team.performanceSuperstar', label: 'Superstar' },
  { value: 'Strong', key: 'team.performanceStrong', label: 'Strong' },
  { value: 'On track', key: 'team.performanceOnTrack', label: 'On track' },
  { value: 'Concerns', key: 'team.performanceConcerns', label: 'Concerns' },
  { value: 'Issue', key: 'team.performanceIssue', label: 'Issue' }
];

const potentialOptions = [
  { value: 'High', key: 'team.potentialHigh', label: 'High' },
  { value: 'Medium', key: 'team.potentialMedium', label: 'Medium' },
  { value: 'Low', key: 'team.potentialLow', label: 'Low' }
];

const personFields = [
  'name',
  'email',
  'phone',
  'relation',
  'context',
  'mission_statement',
  'strengths',
  'growth_areas',
  'aspirations',
  'organization',
  'team',
  'manager_name',
  'circle_type',
  'relationship_health',
  'strategic_importance',
  'last_interaction_at',
  'next_action',
  'current_goals',
  'development_plan',
  'stretch_assignments',
  'coaching_focus',
  'performance_indicator',
  'potential_indicator',
  'stakeholder_mission',
  'stakeholder_priorities',
  'success_metrics',
  'stakeholder_strengths',
  'risks_or_pressures',
  'stakeholder_aspirations',
  'how_i_create_value',
  'mission_alignment',
  'potential_tensions',
  'relationship_strategy'
];

const blankPerson = personFields.reduce((acc, field) => ({ ...acc, [field]: '' }), {});

export default function MyTeam({ apiUrl, userNumber }) {
  const { t } = useLanguage();
  const copy = (key, fallback) => t(key, fallback);
  const [people, setPeople] = useState([]);
  const [reviewsByPerson, setReviewsByPerson] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);
  const [viewingPersonId, setViewingPersonId] = useState(null);

  useEffect(() => {
    fetchPeople();
  }, []);

  const fetchPeople = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${apiUrl}/api/journey/people`, {
        params: { user_number: userNumber }
      });
      const nextPeople = Array.isArray(response.data) ? response.data : [];
      setPeople(nextPeople);
      fetchRecentReviews(nextPeople);
    } catch (err) {
      console.error('Error fetching people:', err);
      setError(copy('team.loadError', 'Failed to load your leadership ecosystem.'));
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentReviews = async (items) => {
    const circlePeople = items.filter((person) => person.circle_type || hasNotes(person)).slice(0, 12);
    const entries = await Promise.all(circlePeople.map(async (person) => {
      try {
        const response = await axios.get(`${apiUrl}/api/journey/people/${person.id}/review-history`, {
          params: { user_number: userNumber }
        });
        return [person.id, response.data?.reviews || []];
      } catch (err) {
        console.warn('Could not load review history.', err);
        return [person.id, []];
      }
    }));
    setReviewsByPerson(Object.fromEntries(entries));
  };

  const createPerson = async (personData) => {
    try {
      await axios.post(`${apiUrl}/api/journey/people`, normalizePayload(personData), {
        params: { user_number: userNumber }
      });
      setShowAddForm(false);
      await fetchPeople();
    } catch (err) {
      console.error('Error adding person:', err);
      alert(copy('team.saveError', 'Failed to save this person.'));
    }
  };

  const updatePerson = async (personId, updates) => {
    try {
      await axios.put(`${apiUrl}/api/journey/people/${personId}`, normalizePayload(updates), {
        params: { user_number: userNumber }
      });
      setEditingPerson(null);
      await fetchPeople();
    } catch (err) {
      console.error('Error updating person:', err);
      alert(copy('team.saveError', 'Failed to save this person.'));
    }
  };

  const deletePerson = async (personId) => {
    if (!confirm(copy('team.deleteConfirm', 'Delete this person?'))) return;
    try {
      await axios.delete(`${apiUrl}/api/journey/people/${personId}`, {
        params: { user_number: userNumber }
      });
      setPeople((current) => current.filter((person) => person.id !== personId));
      setViewingPersonId(null);
      setEditingPerson(null);
    } catch (err) {
      console.error('Error deleting person:', err);
      alert(copy('team.deleteError', 'Failed to delete this person.'));
    }
  };

  const markCircle = (person, circleType) => {
    updatePerson(person.id, { circle_type: person.circle_type === circleType ? '' : circleType });
  };

  const leadershipCircle = useMemo(
    () => people.filter((person) => person.circle_type === CIRCLE.LEADERSHIP),
    [people]
  );
  const sponsorCircle = useMemo(
    () => people.filter((person) => person.circle_type === CIRCLE.SPONSOR),
    [people]
  );
  const teamMembers = useMemo(
    () => people.filter((person) => isTeamMember(person)),
    [people]
  );
  const stakeholders = useMemo(
    () => people.filter((person) => isStakeholder(person)),
    [people]
  );
  const attentionItems = useMemo(
    () => buildAttentionItems(people, copy),
    [people]
  );
  const recentNotes = useMemo(
    () => buildRecentNotes(people, reviewsByPerson),
    [people, reviewsByPerson]
  );

  if (viewingPersonId) {
    return (
      <PersonProfile
        personId={viewingPersonId}
        apiUrl={apiUrl}
        userNumber={userNumber}
        copy={copy}
        onClose={() => {
          setViewingPersonId(null);
          fetchPeople();
        }}
        onDeleted={(personId) => {
          setPeople((current) => current.filter((person) => person.id !== personId));
          setViewingPersonId(null);
        }}
      />
    );
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-600">{copy('team.loading', 'Loading your leadership ecosystem...')}</div>;
  }

  if (error) {
    return <div className="flex h-64 items-center justify-center text-red-600">{error}</div>;
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{copy('team.ecosystemTitle', 'My Leadership Ecosystem')}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {copy('team.ecosystemSubtitle', 'Lead your team, develop your inner circle, and manage the sponsor relationships that amplify your mission.')}
          </p>
        </div>
        <button onClick={() => setShowAddForm(true)} className="rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700">
          {copy('team.addPerson', '+ Add Person')}
        </button>
      </header>

      <nav className="mb-6 flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
        {tabs.map(([id, key, fallback]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`whitespace-nowrap rounded px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {copy(key, fallback)}
          </button>
        ))}
      </nav>

      {showAddForm && (
        <div className="mb-6">
          <PersonForm copy={copy} onSubmit={createPerson} onCancel={() => setShowAddForm(false)} />
        </div>
      )}

      {activeTab === 'overview' && (
        <OverviewTab
          copy={copy}
          leadershipCircle={leadershipCircle}
          sponsorCircle={sponsorCircle}
          attentionItems={attentionItems}
          recentNotes={recentNotes}
          onOpen={setViewingPersonId}
        />
      )}

      {activeTab === 'leadership' && (
        <CircleTab
          copy={copy}
          title={copy('team.leadershipTitle', 'Leadership Circle')}
          intro={copy('team.leadershipIntro', 'People you are intentionally developing this quarter.')}
          emptyText={copy('team.leadershipEmpty', 'Choose 5-7 people you are intentionally developing this quarter.')}
          warning={leadershipCircle.length > 7 ? copy('team.leadershipLimitWarning', 'Leadership Circles work best when they stay focused. Consider whether all these people need deep development attention this quarter.') : null}
          people={leadershipCircle}
          allPeople={people}
          circleType={CIRCLE.LEADERSHIP}
          onOpen={setViewingPersonId}
          onEdit={setEditingPerson}
          onMark={markCircle}
        />
      )}

      {activeTab === 'sponsor' && (
        <CircleTab
          copy={copy}
          title={copy('team.sponsorTitle', 'Sponsor Circle')}
          intro={copy('team.sponsorIntro', 'High-leverage relationships that can amplify your mission.')}
          emptyText={copy('team.sponsorEmpty', 'Choose 5-7 relationships that most influence your ability to deliver your mission.')}
          warning={sponsorCircle.length > 7 ? copy('team.sponsorLimitWarning', 'Sponsor Circles work best when they focus on the few relationships that most influence your mission.') : null}
          people={sponsorCircle}
          allPeople={people}
          circleType={CIRCLE.SPONSOR}
          onOpen={setViewingPersonId}
          onEdit={setEditingPerson}
          onMark={markCircle}
        />
      )}

      {activeTab === 'team' && (
        <TableTab
          copy={copy}
          people={teamMembers}
          emptyText={copy('team.fullTeamEmpty', 'No team members yet. Add people to your leadership ecosystem.')}
          columns={['name', 'role', 'team', 'manager', 'health', 'lastInteraction', 'objective', 'strength', 'risk', 'circle']}
          onOpen={setViewingPersonId}
          onEdit={setEditingPerson}
          onMark={markCircle}
        />
      )}

      {activeTab === 'stakeholders' && (
        <TableTab
          copy={copy}
          people={stakeholders}
          emptyText={copy('team.stakeholdersEmpty', 'No stakeholders yet. Add sponsors, peers, mentors, or client sponsors here.')}
          columns={['name', 'role', 'organization', 'type', 'health', 'importance', 'lastInteraction', 'priority', 'nextAction', 'sponsor']}
          onOpen={setViewingPersonId}
          onEdit={setEditingPerson}
          onMark={markCircle}
        />
      )}

      {activeTab === 'notes' && (
        <NotesTab copy={copy} people={people} recentNotes={recentNotes} onOpen={setViewingPersonId} />
      )}

      {editingPerson && (
        <Modal title={copy('team.editPerson', 'Edit Person')} onClose={() => setEditingPerson(null)}>
          <PersonForm
            copy={copy}
            person={editingPerson}
            onSubmit={(data) => updatePerson(editingPerson.id, data)}
            onCancel={() => setEditingPerson(null)}
            onDelete={() => deletePerson(editingPerson.id)}
          />
        </Modal>
      )}
    </div>
  );
}

function OverviewTab({ copy, leadershipCircle, sponsorCircle, attentionItems, recentNotes, onOpen }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <OverviewCard title={copy('team.leadershipTitle', 'Leadership Circle')} people={leadershipCircle.slice(0, 7)} emptyText={copy('team.leadershipEmpty', 'Choose 5-7 people you are intentionally developing this quarter.')} onOpen={onOpen} mode="leadership" />
      <OverviewCard title={copy('team.sponsorTitle', 'Sponsor Circle')} people={sponsorCircle.slice(0, 7)} emptyText={copy('team.sponsorEmpty', 'Choose 5-7 relationships that most influence your ability to deliver your mission.')} onOpen={onOpen} mode="sponsor" />
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-900">{copy('team.attentionNeeded', 'Attention Needed')}</h2>
        {attentionItems.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">{copy('team.attentionEmpty', 'No urgent relationship gaps detected. Your leadership ecosystem looks healthy.')}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {attentionItems.slice(0, 8).map((item) => (
              <button key={`${item.person.id}-${item.reason}`} onClick={() => onOpen(item.person.id)} className="block w-full rounded border border-slate-200 p-3 text-left hover:bg-slate-50">
                <p className="font-semibold text-slate-900">{item.person.name}</p>
                <p className="mt-1 text-sm text-slate-600">{item.reason}</p>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-900">{copy('team.recentNotes', 'Recent Relationship Notes')}</h2>
        <NotesList copy={copy} notes={recentNotes.slice(0, 8)} onOpen={onOpen} />
      </section>
    </div>
  );
}

function OverviewCard({ title, people, emptyText, onOpen, mode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {people.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">{emptyText}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {people.map((person) => (
            <button key={person.id} onClick={() => onOpen(person.id)} className="block w-full rounded border border-slate-200 p-3 text-left hover:bg-slate-50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{person.name}</p>
                </div>
                <HealthBadge value={person.relationship_health} />
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">{mode === 'sponsor' ? person.stakeholder_mission || person.mission_alignment || 'No sponsor mission captured yet.' : person.mission_statement || 'No mission captured yet.'}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function CircleTab({ copy, title, intro, emptyText, warning, people, allPeople, circleType, onOpen, onEdit, onMark }) {
  const candidates = allPeople.filter((person) => person.circle_type !== circleType);
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{intro}</p>
          </div>
          <span className="rounded border border-slate-200 px-3 py-1 text-sm font-medium text-slate-600">{people.length}/7</span>
        </div>
        {warning && <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{warning}</p>}
      </section>

      {people.length === 0 ? (
        <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-600">{emptyText}</section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {people.map((person) => (
            <PersonCard key={person.id} copy={copy} person={person} mode={circleType} onOpen={onOpen} onEdit={onEdit} onMark={onMark} />
          ))}
        </div>
      )}

      {candidates.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-slate-900">{copy('team.addToCircle', 'Add to this circle')}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {candidates.slice(0, 12).map((person) => (
              <button key={person.id} onClick={() => onMark(person, circleType)} className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                {person.name}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PersonCard({ copy, person, mode, onOpen, onEdit, onMark }) {
  const isSponsor = mode === CIRCLE.SPONSOR;
  const summary = isSponsor ? [
    ['Mission', person.stakeholder_mission],
    ['Priorities', person.stakeholder_priorities],
    ['Value I create', person.how_i_create_value],
    ['Alignment', person.mission_alignment],
    ['Strategy', person.relationship_strategy],
    ['Next action', person.next_action]
  ] : [
    ['Mission', person.mission_statement],
    ['Strengths', person.strengths],
    ['Development areas', person.growth_areas],
    ['Aspirations', person.aspirations],
    ['Performance', person.performance_indicator],
    ['Potential', person.potential_indicator]
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => onOpen(person.id)} className="text-left">
          <h3 className="text-lg font-bold text-slate-900">{person.name}</h3>
        </button>
        <HealthBadge value={person.relationship_health} />
      </div>
      <dl className="mt-4 space-y-3">
        {summary.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-1 line-clamp-3 text-sm text-slate-700">{value || 'Not captured yet'}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={() => onOpen(person.id)} className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">{copy('team.openProfile', 'Open profile')}</button>
        <button onClick={() => onEdit(person)} className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">{copy('team.edit', 'Edit')}</button>
        <button onClick={() => onMark(person, mode)} className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">{copy('team.removeFromCircle', 'Remove from circle')}</button>
      </div>
    </section>
  );
}

function TableTab({ copy, people, emptyText, columns, onOpen, onEdit, onMark }) {
  if (people.length === 0) {
    return <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-600">{emptyText}</section>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => <th key={column} className="px-4 py-3">{columnLabel(copy, column)}</th>)}
            <th className="px-4 py-3">{copy('team.actions', 'Actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {people.map((person) => (
            <tr key={person.id}>
              {columns.map((column) => (
                <td key={column} className="max-w-[220px] px-4 py-3 align-top text-slate-700">
                  {renderColumn(person, column, onMark)}
                </td>
              ))}
              <td className="px-4 py-3 align-top">
                <div className="flex gap-2">
                  <button onClick={() => onOpen(person.id)} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">{copy('team.open', 'Open')}</button>
                  <button onClick={() => onEdit(person)} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">{copy('team.edit', 'Edit')}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotesTab({ copy, people, recentNotes, onOpen }) {
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-bold text-slate-900">{copy('team.notesTitle', 'Relationship Reviews / Notes')}</h2>
        <p className="mt-1 text-sm text-slate-600">{copy('team.notesIntro', 'Open any person to add meeting notes, relationship notes, or start a people review.')}</p>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="font-bold text-slate-900">{copy('team.recentNotes', 'Recent Relationship Notes')}</h3>
        <NotesList copy={copy} notes={recentNotes} onOpen={onOpen} />
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="font-bold text-slate-900">{copy('team.allPeople', 'All People')}</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {people.map((person) => (
            <button key={person.id} onClick={() => onOpen(person.id)} className="rounded border border-slate-200 p-3 text-left hover:bg-slate-50">
              <p className="font-semibold text-slate-900">{person.name}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function NotesList({ copy, notes, onOpen }) {
  if (!notes.length) {
    return <p className="mt-4 text-sm text-slate-600">{copy('team.notesEmpty', 'No recent relationship notes yet.')}</p>;
  }
  return (
    <div className="mt-4 space-y-3">
      {notes.map((note) => (
        <button key={note.id} onClick={() => onOpen(note.personId)} className="block w-full rounded border border-slate-200 p-3 text-left hover:bg-slate-50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">{note.personName}</p>
              <p className="text-sm text-slate-500">{note.type} - {formatDisplayDate(note.date)}</p>
            </div>
            {note.health && <ImpactBadge value={note.health} />}
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-slate-700">{note.summary}</p>
        </button>
      ))}
    </div>
  );
}

function PersonProfile({ personId, apiUrl, userNumber, copy, onClose, onDeleted }) {
  const [person, setPerson] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [synthesis, setSynthesis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [showMeetingNoteForm, setShowMeetingNoteForm] = useState(false);
  const [expandedMeetingNoteId, setExpandedMeetingNoteId] = useState(null);
  const [expandedReviewId, setExpandedReviewId] = useState(null);
  const [meetingNoteDraft, setMeetingNoteDraft] = useState({
    title: '',
    note_type: '1:1',
    meeting_date: new Date().toISOString().slice(0, 10),
    notes: '',
    commitments: '',
    follow_up_action: '',
    health_impact: ''
  });

  useEffect(() => {
    fetchPersonData();
  }, [personId]);

  const fetchPersonData = async () => {
    try {
      const peopleResponse = await axios.get(`${apiUrl}/api/journey/people`, {
        params: { user_number: userNumber }
      });
      const foundPerson = peopleResponse.data.find((item) => item.id === personId);
      setPerson(foundPerson);
      const reviewsResponse = await axios.get(`${apiUrl}/api/journey/people/${personId}/review-history`, {
        params: { user_number: userNumber }
      });
      const nextReviews = reviewsResponse.data.reviews || [];
      setReviews(nextReviews);
      await generateSynthesis(nextReviews);
    } catch (err) {
      console.error('Error fetching person profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateSynthesis = async (reviewsData) => {
    try {
      const response = await axios.get(`${apiUrl}/api/journey/people/${personId}/synthesis`, {
        params: { user_number: userNumber }
      });
      setSynthesis(response.data);
    } catch (err) {
      console.error('Error generating synthesis:', err);
      setSynthesis({
        strengths: ['Review history will sharpen this profile over time.'],
        improvements: ['Add notes, next actions, and review outcomes to build signal.'],
        trajectory: reviewsData.length ? 'Relationship profile is forming from saved reviews.' : 'No review trend yet.'
      });
    }
  };

  const updateProfilePerson = async (updates) => {
    try {
      await axios.put(`${apiUrl}/api/journey/people/${personId}`, normalizePayload(updates), {
        params: { user_number: userNumber }
      });
      setIsEditing(false);
      await fetchPersonData();
    } catch (err) {
      console.error('Error updating person:', err);
      alert(copy('team.saveError', 'Failed to save this person.'));
    }
  };

  const deleteProfilePerson = async () => {
    if (!confirm(copy('team.deleteConfirm', 'Delete this person?'))) return;
    try {
      await axios.delete(`${apiUrl}/api/journey/people/${personId}`, {
        params: { user_number: userNumber }
      });
      onDeleted?.(personId);
    } catch (err) {
      console.error('Error deleting person:', err);
      alert(copy('team.deleteError', 'Failed to delete this person.'));
    }
  };

  const saveMeetingNote = async (event) => {
    event.preventDefault();
    if (!meetingNoteDraft.notes.trim()) {
      alert(copy('team.noteRequired', 'Please enter your notes.'));
      return;
    }
    const existingNotes = Array.isArray(person.meeting_notes) ? person.meeting_notes : [];
    const meetingDate = meetingNoteDraft.meeting_date || new Date().toISOString().slice(0, 10);
    const note = {
      id: `${Date.now()}`,
      title: meetingNoteDraft.title.trim() || `${meetingNoteDraft.note_type} - ${formatDisplayDate(meetingDate)}`,
      note_type: meetingNoteDraft.note_type,
      meeting_date: meetingDate,
      notes: meetingNoteDraft.notes.trim(),
      commitments: meetingNoteDraft.commitments.trim(),
      follow_up_action: meetingNoteDraft.follow_up_action.trim(),
      health_impact: meetingNoteDraft.health_impact,
      created_at: new Date().toISOString()
    };
    const updatedNotes = [note, ...existingNotes];
    try {
      await axios.put(`${apiUrl}/api/journey/people/${personId}`, {
        meeting_notes: updatedNotes,
        next_action: note.follow_up_action || person.next_action,
        last_interaction_at: `${meetingDate}T12:00:00`
      }, {
        params: { user_number: userNumber }
      });
      setPerson({ ...person, meeting_notes: updatedNotes, next_action: note.follow_up_action || person.next_action, last_interaction_at: `${meetingDate}T12:00:00` });
      setExpandedMeetingNoteId(note.id);
      setMeetingNoteDraft({
        title: '',
        note_type: '1:1',
        meeting_date: new Date().toISOString().slice(0, 10),
        notes: '',
        commitments: '',
        follow_up_action: '',
        health_impact: ''
      });
      setShowMeetingNoteForm(false);
    } catch (err) {
      console.error('Error saving meeting note:', err);
      alert(copy('team.noteSaveError', 'Failed to save note.'));
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">{copy('team.profileLoading', 'Loading profile...')}</div>;
  if (!person) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-red-600">{copy('team.profileMissing', 'Person not found')}</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <button onClick={onClose} className="text-sm font-medium text-slate-600 hover:text-slate-900">{copy('team.back', 'Back')}</button>
          <h1 className="text-xl font-bold text-slate-900">{person.name}</h1>
          <button onClick={() => setIsEditing(true)} className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">{copy('team.edit', 'Edit')}</button>
        </div>
      </div>
      <main className="mx-auto max-w-5xl px-6 py-8">
        {isEditing && (
          <div className="mb-6">
            <PersonForm copy={copy} person={person} onSubmit={updateProfilePerson} onCancel={() => setIsEditing(false)} onDelete={deleteProfilePerson} />
          </div>
        )}
        <div className="mb-6 flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
          {[
            ['profile', 'People Profile'],
            ['meeting-notes', 'Relationship Notes'],
            ['review', 'People Review']
          ].map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`rounded px-3 py-2 text-sm font-medium ${activeTab === id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              {label}
            </button>
          ))}
        </div>
        {activeTab === 'profile' && <ProfileTab copy={copy} person={person} synthesis={synthesis} reviews={reviews} expandedReviewId={expandedReviewId} setExpandedReviewId={setExpandedReviewId} />}
        {activeTab === 'meeting-notes' && (
          <MeetingNotesTab
            copy={copy}
            notes={Array.isArray(person.meeting_notes) ? person.meeting_notes : []}
            showForm={showMeetingNoteForm}
            setShowForm={setShowMeetingNoteForm}
            draft={meetingNoteDraft}
            setDraft={setMeetingNoteDraft}
            onSave={saveMeetingNote}
            expandedNoteId={expandedMeetingNoteId}
            setExpandedNoteId={setExpandedMeetingNoteId}
          />
        )}
        {activeTab === 'review' && <PeopleReviewTab apiUrl={apiUrl} userNumber={userNumber} person={person} reviews={reviews} />}
      </main>
    </div>
  );
}

function ProfileTab({ copy, person, synthesis, reviews, expandedReviewId, setExpandedReviewId }) {
  const isSponsor = person.circle_type === CIRCLE.SPONSOR;
  const sections = isSponsor ? [
    ['Sponsor Profile', [
      ['Their mission', person.stakeholder_mission],
      ['Their priorities', person.stakeholder_priorities],
      ['Success metrics', person.success_metrics],
      ['Strengths', person.stakeholder_strengths],
      ['Risks / pressures', person.risks_or_pressures],
      ['Aspirations', person.stakeholder_aspirations],
      ['How I create value', person.how_i_create_value],
      ['Alignment with my mission', person.mission_alignment],
      ['Potential tensions', person.potential_tensions],
      ['Relationship strategy', person.relationship_strategy],
      ['Next relationship action', person.next_action]
    ]]
  ] : [
    ['Leadership Profile', [
      ['Mission', person.mission_statement],
      ['Strengths', person.strengths],
      ['Development areas', person.growth_areas],
      ['Aspirations', person.aspirations],
      ['Performance indicator', person.performance_indicator],
      ['Potential indicator', person.potential_indicator]
    ]]
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{person.name}</h2>
            <p className="mt-1 text-slate-600">{person.relation || 'Relationship'}{person.organization ? ` - ${person.organization}` : ''}</p>
          </div>
          <HealthBadge value={person.relationship_health} />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <InfoTile label={copy('team.circleStatus', 'Circle status')} value={circleLabel(person.circle_type)} />
          <InfoTile label={copy('team.lastInteraction', 'Last interaction')} value={formatDisplayDate(person.last_interaction_at)} />
        </div>
      </section>
      {sections.map(([title, items]) => (
        <section key={title} className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {items.map(([label, value]) => <InfoTile key={label} label={label} value={value} />)}
          </div>
        </section>
      ))}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h3 className="text-lg font-bold text-slate-900">{copy('team.synthesis', 'Relationship Synthesis')}</h3>
        {synthesis && (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <InfoTile label={copy('team.strengths', 'Strengths')} value={(synthesis.strengths || []).join(', ')} />
            <InfoTile label={copy('team.opportunities', 'Opportunities')} value={(synthesis.improvements || []).join(', ')} />
            <InfoTile label={copy('team.trajectory', 'Trajectory')} value={synthesis.trajectory} />
          </div>
        )}
      </section>
      <ReviewHistory copy={copy} reviews={reviews} expandedReviewId={expandedReviewId} setExpandedReviewId={setExpandedReviewId} />
    </div>
  );
}

function MeetingNotesTab({ copy, notes, showForm, setShowForm, draft, setDraft, onSave, expandedNoteId, setExpandedNoteId }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">{copy('team.notesTitle', 'Relationship Notes')}</h2>
        <button type="button" onClick={() => setShowForm(!showForm)} className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">{copy('team.addNote', '+ Add Note')}</button>
      </div>
      {showForm && (
        <form onSubmit={onSave} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_220px_180px]">
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={copy('team.noteTitle', 'Note title')} className="rounded border border-slate-300 px-3 py-2" />
            <select value={draft.note_type} onChange={(event) => setDraft({ ...draft, note_type: event.target.value })} className="rounded border border-slate-300 px-3 py-2">
              {['1:1', 'Coaching conversation', 'Feedback given', 'Stakeholder update', 'Conflict / tension', 'Win / recognition', 'Development moment', 'Career conversation', 'Sponsorship conversation'].map((type) => <option key={type}>{type}</option>)}
            </select>
            <input type="date" value={draft.meeting_date} onChange={(event) => setDraft({ ...draft, meeting_date: event.target.value })} className="rounded border border-slate-300 px-3 py-2" />
          </div>
          <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder={copy('team.noteSummary', 'Summary')} rows={5} className="w-full rounded border border-slate-300 px-3 py-2" required />
          <div className="grid gap-4 md:grid-cols-3">
            <textarea value={draft.commitments} onChange={(event) => setDraft({ ...draft, commitments: event.target.value })} placeholder={copy('team.commitments', 'Commitments made')} rows={3} className="rounded border border-slate-300 px-3 py-2" />
            <textarea value={draft.follow_up_action} onChange={(event) => setDraft({ ...draft, follow_up_action: event.target.value })} placeholder={copy('team.followUpAction', 'Follow-up action')} rows={3} className="rounded border border-slate-300 px-3 py-2" />
            <select value={draft.health_impact} onChange={(event) => setDraft({ ...draft, health_impact: event.target.value })} className="h-10 rounded border border-slate-300 px-3 py-2">
              <option value="">{copy('team.healthImpact', 'Health impact')}</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">{copy('team.saveNote', 'Save Note')}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded bg-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-300">{copy('team.cancel', 'Cancel')}</button>
          </div>
        </form>
      )}
      {notes.length === 0 ? (
        <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-600">{copy('team.notesEmpty', 'No recent relationship notes yet.')}</section>
      ) : (
        <div className="space-y-3">
          {notes.map((note, index) => {
            const noteId = note.id || `${note.meeting_date}-${index}`;
            const isExpanded = expandedNoteId === noteId;
            return (
              <section key={noteId} className="rounded-lg border border-slate-200 bg-white">
                <button type="button" onClick={() => setExpandedNoteId(isExpanded ? null : noteId)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50">
                  <div>
                    <h3 className="font-semibold text-slate-900">{note.title || `Relationship note ${notes.length - index}`}</h3>
                    <p className="mt-1 text-sm text-slate-500">{note.note_type || 'Note'} - {formatDisplayDate(note.meeting_date)}</p>
                  </div>
                  <span className="text-sm font-medium text-slate-500">{isExpanded ? copy('team.close', 'Close') : copy('team.open', 'Open')}</span>
                </button>
                {isExpanded && (
                  <div className="space-y-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-700">
                    <p className="whitespace-pre-wrap leading-6">{note.notes}</p>
                    {note.commitments && <InfoTile label={copy('team.commitments', 'Commitments made')} value={note.commitments} />}
                    {note.follow_up_action && <InfoTile label={copy('team.followUpAction', 'Follow-up action')} value={note.follow_up_action} />}
                    {note.health_impact && <InfoTile label={copy('team.healthImpact', 'Health impact')} value={note.health_impact} />}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PeopleReviewTab({ apiUrl, userNumber, person, reviews }) {
  return (
    <div className="space-y-4">
      <PreviousPeopleReviews person={person} reviews={reviews} />
      <div className="min-h-[720px] overflow-hidden rounded-md border border-slate-200 bg-white">
        <MyCoachingSessions
          apiUrl={apiUrl}
          userNumber={userNumber}
          visibleSessionTypes={PEOPLE_REVIEW_SESSION_TYPES}
          launchLabelByType={{ people_review: 'Start People Review' }}
          emptyStateText={PEOPLE_REVIEW_EMPTY_STATE}
          loadInitialHistory={false}
          selectedPersonName={person.name}
        />
      </div>
    </div>
  );
}

function PreviousPeopleReviews({ person, reviews }) {
  if (!reviews.length) {
    return <section className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">No people reviews yet for {person.name}. Start one below to build a clearer relationship profile.</section>;
  }
  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-slate-900">
          <span>Previous People Reviews ({reviews.length})</span>
          <span className="text-slate-500 transition-transform group-open:rotate-180">v</span>
        </summary>
        <div className="space-y-3 border-t border-slate-200 px-5 py-4">
          {reviews.map((review, index) => (
            <details key={review.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                {index === 0 ? 'Latest Review' : `Review ${reviews.length - index}`} - {formatDisplayDate(review.review_date)}
              </summary>
              <div className="mt-4 space-y-3">
                {review.relationship_strength && <HealthBadge value={review.relationship_strength} />}
                {review.insights && <InfoTile label="Insight" value={review.insights} />}
                {review.patterns_noticed && <InfoTile label="Pattern" value={review.patterns_noticed} />}
                {review.next_steps && <InfoTile label="Next Steps" value={review.next_steps} />}
              </div>
            </details>
          ))}
        </div>
      </details>
    </section>
  );
}

function ReviewHistory({ copy, reviews, expandedReviewId, setExpandedReviewId }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-bold text-slate-900">{copy('team.reviewHistory', 'Review History')}</h3>
      {reviews.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">{copy('team.reviewEmpty', 'No reviews yet. Start your first review to build this relationship profile.')}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {reviews.map((review) => (
            <section key={review.id} className="rounded border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{formatDisplayDate(review.review_date)}</p>
                  {review.insights && <p className="mt-1 text-sm text-slate-600">{review.insights}</p>}
                </div>
                <button onClick={() => setExpandedReviewId(expandedReviewId === review.id ? null : review.id)} className="text-sm font-medium text-slate-600 hover:text-slate-900">
                  {expandedReviewId === review.id ? copy('team.close', 'Close') : copy('team.open', 'Open')}
                </button>
              </div>
              {expandedReviewId === review.id && (
                <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2">
                  {Object.entries({
                    'Current Dynamics': review.current_dynamics,
                    'Strategic Importance': review.strategic_importance,
                    'Mutual Value': review.mutual_value,
                    'Unresolved Issues': review.unresolved_issues,
                    'Patterns Noticed': review.patterns_noticed,
                    'How to Strengthen': review.how_to_strengthen,
                    'Communication Plan': review.communication_plan,
                    'Next Steps': review.next_steps
                  }).map(([label, value]) => value ? <InfoTile key={label} label={label} value={value} /> : null)}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function PersonForm({ copy, person, onSubmit, onCancel, onDelete }) {
  const [formData, setFormData] = useState(() => ({ ...blankPerson, ...person, last_interaction_at: toDateInput(person?.last_interaction_at) }));
  const isSponsor = formData.circle_type === CIRCLE.SPONSOR;

  const setField = (field, value) => setFormData((current) => ({ ...current, [field]: value }));
  const handleSubmit = (event) => {
    event.preventDefault();
    if (!formData.name.trim()) {
      alert(copy('team.nameRequired', 'Please enter a name.'));
      return;
    }
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <TextInput label={copy('team.name', 'Name')} value={formData.name} onChange={(value) => setField('name', value)} required />
        <TextInput label={copy('team.role', 'Role / Relationship')} value={formData.relation} onChange={(value) => setField('relation', value)} />
        <label className="block text-sm font-medium text-slate-700">
          {copy('team.circleStatus', 'Circle status')}
          <select value={formData.circle_type || ''} onChange={(event) => setField('circle_type', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            <option value="">{copy('team.noCircle', 'No circle')}</option>
            <option value={CIRCLE.LEADERSHIP}>{copy('team.leadershipTitle', 'Leadership Circle')}</option>
            <option value={CIRCLE.SPONSOR}>{copy('team.sponsorTitle', 'Sponsor Circle')}</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          {copy('team.relationshipHealth', 'Relationship health')}
          <select value={formData.relationship_health || ''} onChange={(event) => setField('relationship_health', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            <option value="">{copy('team.chooseRelationshipHealth', 'Choose relationship health')}</option>
            {relationshipHealthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value}. {copy(option.key, option.label)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          {copy('team.lastInteraction', 'Last interaction')}
          <input type="date" value={formData.last_interaction_at || ''} onChange={(event) => setField('last_interaction_at', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </label>
      </div>

      {!isSponsor && (
        <fieldset className="space-y-4 rounded border border-slate-200 p-4">
          <legend className="px-2 text-sm font-bold text-slate-900">{copy('team.leadershipTitle', 'Leadership Circle')}</legend>
          <TextArea label={copy('team.mission', 'Mission')} value={formData.mission_statement} onChange={(value) => setField('mission_statement', value)} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextArea label={copy('team.strengths', 'Strengths')} value={formData.strengths} onChange={(value) => setField('strengths', value)} />
            <TextArea label={copy('team.developmentAreas', 'Development areas')} value={formData.growth_areas} onChange={(value) => setField('growth_areas', value)} />
            <TextArea label={copy('team.aspirations', 'Aspirations')} value={formData.aspirations} onChange={(value) => setField('aspirations', value)} />
            <div className="grid gap-4 md:grid-cols-2">
              <OptionSelect
                label={copy('team.performance', 'Performance')}
                value={formData.performance_indicator}
                placeholder={copy('team.choosePerformance', 'Choose performance')}
                options={performanceOptions}
                copy={copy}
                onChange={(value) => setField('performance_indicator', value)}
              />
              <OptionSelect
                label={copy('team.potential', 'Potential')}
                value={formData.potential_indicator}
                placeholder={copy('team.choosePotential', 'Choose potential')}
                options={potentialOptions}
                copy={copy}
                onChange={(value) => setField('potential_indicator', value)}
              />
            </div>
          </div>
        </fieldset>
      )}

      {isSponsor && (
        <fieldset className="space-y-4 rounded border border-slate-200 p-4">
          <legend className="px-2 text-sm font-bold text-slate-900">{copy('team.sponsorTitle', 'Sponsor Circle')}</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <TextArea label={copy('team.theirMission', 'Their mission')} value={formData.stakeholder_mission} onChange={(value) => setField('stakeholder_mission', value)} />
            <TextArea label={copy('team.theirPriorities', 'Their priorities')} value={formData.stakeholder_priorities} onChange={(value) => setField('stakeholder_priorities', value)} />
            <TextArea label={copy('team.successMetrics', 'Success metrics')} value={formData.success_metrics} onChange={(value) => setField('success_metrics', value)} />
            <TextArea label={copy('team.stakeholderStrengths', 'Their strengths')} value={formData.stakeholder_strengths} onChange={(value) => setField('stakeholder_strengths', value)} />
            <TextArea label={copy('team.risksPressures', 'Risks / pressures')} value={formData.risks_or_pressures} onChange={(value) => setField('risks_or_pressures', value)} />
            <TextArea label={copy('team.stakeholderAspirations', 'Their aspirations')} value={formData.stakeholder_aspirations} onChange={(value) => setField('stakeholder_aspirations', value)} />
            <TextArea label={copy('team.valueCreation', 'How I create value for them')} value={formData.how_i_create_value} onChange={(value) => setField('how_i_create_value', value)} />
            <TextArea label={copy('team.missionAlignment', 'Alignment with my mission')} value={formData.mission_alignment} onChange={(value) => setField('mission_alignment', value)} />
            <TextArea label={copy('team.potentialTensions', 'Potential tensions')} value={formData.potential_tensions} onChange={(value) => setField('potential_tensions', value)} />
            <label className="block text-sm font-medium text-slate-700">
              {copy('team.relationshipStrategy', 'Relationship strategy')}
              <select value={formData.relationship_strategy || ''} onChange={(event) => setField('relationship_strategy', event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
                <option value="">{copy('team.chooseStrategy', 'Choose a strategy')}</option>
                {relationshipStrategies.map((strategy) => <option key={strategy} value={strategy}>{strategy}</option>)}
              </select>
            </label>
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">{person ? copy('team.saveChanges', 'Save Changes') : copy('team.addPerson', '+ Add Person')}</button>
        <button type="button" onClick={onCancel} className="rounded bg-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-300">{copy('team.cancel', 'Cancel')}</button>
        {person && onDelete && <button type="button" onClick={onDelete} className="ml-auto rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700">{copy('team.delete', 'Delete')}</button>}
      </div>
    </form>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <section className="my-8 w-full max-w-5xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded border border-slate-200 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">Close</button>
        </div>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}

function TextInput({ label, value, onChange, required }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input value={value || ''} onChange={(event) => onChange(event.target.value)} required={required} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
    </label>
  );
}

function TextArea({ label, value, onChange }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <textarea value={value || ''} onChange={(event) => onChange(event.target.value)} rows={3} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
    </label>
  );
}

function OptionSelect({ label, value, placeholder, options, copy, onChange }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select value={value || ''} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
        <option value="">{placeholder}</option>
        {options.map((option, index) => (
          <option key={option.value} value={option.value}>
            {index + 1}. {copy(option.key, option.label)}
          </option>
        ))}
      </select>
    </label>
  );
}

function InfoTile({ label, value }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value || 'Not captured yet'}</p>
    </div>
  );
}

function HealthBadge({ value }) {
  if (!value) return <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500">No health</span>;
  const score = Number(value);
  if (Number.isNaN(score)) return <ImpactBadge value={value} />;
  const option = relationshipHealthOptions.find((item) => item.value === score);
  const color = score <= 2
    ? 'border-green-200 bg-green-50 text-green-700'
    : score === 3
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-red-200 bg-red-50 text-red-700';
  return <span className={`rounded border px-2 py-1 text-xs font-semibold ${color}`}>{score}. {option?.label || 'Health'}</span>;
}

function ImpactBadge({ value }) {
  const normalized = String(value || '').toLowerCase();
  const color = normalized === 'negative'
    ? 'border-red-200 bg-red-50 text-red-700'
    : normalized === 'positive'
      ? 'border-green-200 bg-green-50 text-green-700'
      : 'border-slate-200 bg-slate-50 text-slate-600';
  return <span className={`rounded border px-2 py-1 text-xs font-semibold capitalize ${color}`}>{value}</span>;
}

function normalizePayload(data) {
  const payload = { ...data };
  if (payload.relationship_health !== '' && payload.relationship_health != null) {
    payload.relationship_health = Number(payload.relationship_health);
  } else {
    delete payload.relationship_health;
  }
  if (payload.last_interaction_at && !String(payload.last_interaction_at).includes('T')) {
    payload.last_interaction_at = `${payload.last_interaction_at}T12:00:00`;
  }
  personFields.forEach((field) => {
    if (payload[field] === undefined || payload[field] === null) return;
    if (typeof payload[field] === 'string') payload[field] = payload[field].trim();
  });
  return payload;
}

function isTeamMember(person) {
  const relation = (person.relation || '').toLowerCase();
  return person.circle_type === CIRCLE.LEADERSHIP || relation.includes('team') || relation.includes('direct') || relation.includes('employee') || person.team;
}

function isStakeholder(person) {
  const relation = (person.relation || '').toLowerCase();
  return person.circle_type === CIRCLE.SPONSOR || ['sponsor', 'stakeholder', 'mentor', 'peer', 'client'].some((word) => relation.includes(word)) || person.organization;
}

function hasNotes(person) {
  return Array.isArray(person.meeting_notes) && person.meeting_notes.length > 0;
}

function buildAttentionItems(people, copy) {
  const items = [];
  people.forEach((person) => {
    const days = daysSince(person.last_interaction_at);
    if (person.relationship_health && Number(person.relationship_health) >= 4) items.push({ person, reason: copy('team.attentionLowHealth', 'Relationship health is low.') });
    if (days != null && days > 21) items.push({ person, reason: `${person.name} has not had a logged interaction in ${days} days.` });
    if (person.circle_type === CIRCLE.SPONSOR && !person.relationship_strategy) items.push({ person, reason: `${person.name} is in your Sponsor Circle but has no relationship strategy.` });
  });
  const leadershipCount = people.filter((person) => person.circle_type === CIRCLE.LEADERSHIP).length;
  const sponsorCount = people.filter((person) => person.circle_type === CIRCLE.SPONSOR).length;
  if (leadershipCount > 7) items.unshift({ person: people.find((person) => person.circle_type === CIRCLE.LEADERSHIP), reason: `Your Leadership Circle has ${leadershipCount} people. Consider narrowing it.` });
  if (sponsorCount > 7) items.unshift({ person: people.find((person) => person.circle_type === CIRCLE.SPONSOR), reason: `Your Sponsor Circle has ${sponsorCount} people. Consider narrowing it.` });
  return items.filter((item) => item.person);
}

function buildRecentNotes(people, reviewsByPerson) {
  const notes = [];
  people.forEach((person) => {
    (Array.isArray(person.meeting_notes) ? person.meeting_notes : []).forEach((note, index) => {
      notes.push({
        id: `note-${person.id}-${note.id || index}`,
        personId: person.id,
        personName: person.name,
        type: note.note_type || 'Meeting note',
        date: note.meeting_date || note.created_at,
        summary: note.notes || note.summary || note.title,
        health: note.health_impact
      });
    });
    (reviewsByPerson[person.id] || []).forEach((review) => {
      notes.push({
        id: `review-${review.id}`,
        personId: person.id,
        personName: person.name,
        type: 'People review',
        date: review.review_date,
        summary: review.insights || review.next_steps || review.current_dynamics || 'Relationship review saved.',
        health: review.relationship_strength
      });
    });
  });
  return notes.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function daysSince(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function formatDisplayDate(value) {
  if (!value) return 'Not captured yet';
  const date = String(value).includes('T') ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Not captured yet';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function toDateInput(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function circleLabel(value) {
  if (value === CIRCLE.LEADERSHIP) return 'Leadership Circle';
  if (value === CIRCLE.SPONSOR) return 'Sponsor Circle';
  return 'No circle';
}

function columnLabel(copy, column) {
  const labels = {
    name: copy('team.name', 'Name'),
    role: copy('team.role', 'Role'),
    team: copy('team.team', 'Team'),
    manager: copy('team.manager', 'Manager'),
    health: copy('team.relationshipHealth', 'Relationship health'),
    lastInteraction: copy('team.lastInteraction', 'Last interaction'),
    objective: copy('team.currentObjective', 'Current objective'),
    strength: copy('team.keyStrength', 'Key strength'),
    risk: copy('team.currentRisk', 'Current risk'),
    circle: copy('team.circleStatus', 'Circle status'),
    organization: copy('team.organization', 'Organization'),
    type: copy('team.relationshipType', 'Relationship type'),
    importance: copy('team.strategicImportance', 'Strategic importance'),
    priority: copy('team.currentPriority', 'Current priority'),
    nextAction: copy('team.nextAction', 'Next action'),
    sponsor: copy('team.sponsorStatus', 'Sponsor Circle status')
  };
  return labels[column] || column;
}

function renderColumn(person, column, onMark) {
  if (column === 'name') return <span className="font-semibold text-slate-900">{person.name}</span>;
  if (column === 'role') return person.relation || 'Not captured';
  if (column === 'team') return person.team || 'Not captured';
  if (column === 'manager') return person.manager_name || 'Not captured';
  if (column === 'health') return <HealthBadge value={person.relationship_health} />;
  if (column === 'lastInteraction') return formatDisplayDate(person.last_interaction_at);
  if (column === 'objective') return person.current_goals || 'Not captured';
  if (column === 'strength') return person.strengths || person.stakeholder_strengths || 'Not captured';
  if (column === 'risk') return person.risks_or_pressures || person.growth_areas || 'Not captured';
  if (column === 'circle') return circleLabel(person.circle_type);
  if (column === 'organization') return person.organization || 'Not captured';
  if (column === 'type') return person.relation || 'Not captured';
  if (column === 'importance') return person.strategic_importance || 'Not captured';
  if (column === 'priority') return person.stakeholder_priorities || 'Not captured';
  if (column === 'nextAction') return person.next_action || 'Not captured';
  if (column === 'sponsor') {
    return (
      <button onClick={() => onMark(person, CIRCLE.SPONSOR)} className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">
        {person.circle_type === CIRCLE.SPONSOR ? 'In Sponsor Circle' : 'Add to Sponsor Circle'}
      </button>
    );
  }
  return 'Not captured';
}
