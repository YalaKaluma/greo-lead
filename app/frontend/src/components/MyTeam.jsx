import { useState, useEffect } from 'react';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { useLanguage } from '../i18n/LanguageContext';
import MyCoachingSessions from './MyCoachingSessions';

const PEOPLE_REVIEW_SESSION_TYPES = ['people_review'];
const PEOPLE_REVIEW_EMPTY_STATE = 'Start a people review session to reflect on the current relationship, diagnose patterns, and choose concrete next steps.';

export default function MyTeam({ apiUrl, userNumber }) {
  const { t } = useLanguage();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState(null);
  const [relationFilter, setRelationFilter] = useState('all');
  const [viewingProfile, setViewingProfile] = useState(null); // Person ID for profile view
  const [customOrder, setCustomOrder] = useState([]); // User's manual sort order

  useEffect(() => {
    fetchPeople();
    loadCustomOrder();
  }, []);

  const fetchPeople = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${apiUrl}/api/journey/people`, {
        params: { user_number: userNumber }
      });
      if (response.data && Array.isArray(response.data)) {
        setPeople(response.data);
      }
    } catch (err) {
      console.error('Error fetching people:', err);
      setError('Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const loadCustomOrder = () => {
    const saved = localStorage.getItem('myteam_custom_order');
    if (saved) {
      setCustomOrder(JSON.parse(saved));
    }
  };

  const saveCustomOrder = (order) => {
    localStorage.setItem('myteam_custom_order', JSON.stringify(order));
    setCustomOrder(order);
  };

  const addPerson = async (personData) => {
    try {
      await axios.post(
        `${apiUrl}/api/journey/people`,
        personData,
        { params: { user_number: userNumber } }
      );
      await fetchPeople();
      setShowAddForm(false);
    } catch (err) {
      console.error('Error adding person:', err);
      alert('Failed to add team member');
    }
  };

  const updatePerson = async (personId, updates) => {
    try {
      await axios.put(
        `${apiUrl}/api/journey/people/${personId}`,
        updates,
        { params: { user_number: userNumber } }
      );
      await fetchPeople();
      setEditingPersonId(null);
    } catch (err) {
      console.error('Error updating person:', err);
      alert('Failed to update team member');
    }
  };

  const deletePerson = async (personId) => {
    if (!confirm('Delete this person?')) return;
    
    try {
      await axios.delete(`${apiUrl}/api/journey/people/${personId}`, {
        params: { user_number: userNumber }
      });
      setPeople(people.filter(p => p.id !== personId));
      setViewingProfile(null);
      setEditingPersonId(null);
    } catch (err) {
      console.error('Error deleting person:', err);
      alert('Failed to delete team member');
    }
  };

  // Handle drag and drop
  const onDragEnd = (result) => {
    if (!result.destination) return;
    
    const items = Array.from(getSortedPeople());
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    const newOrder = items.map(p => p.id);
    saveCustomOrder(newOrder);
  };

  // Get people sorted by custom order
  const getSortedPeople = () => {
    const filtered = people.filter(person => {
      if (relationFilter === 'all') return true;
      if (relationFilter === 'team member') return person.relation?.toLowerCase().includes('team');
      if (relationFilter === 'supervisor') return person.relation?.toLowerCase().includes('supervisor');
      if (relationFilter === 'mentor') return person.relation?.toLowerCase().includes('mentor');
      if (relationFilter === 'peer') return person.relation?.toLowerCase().includes('peer') || person.relation?.toLowerCase().includes('colleague');
      return true;
    });

    if (customOrder.length === 0) return filtered;

    // Sort by custom order, then append any new people at the end
    const sorted = [];
    customOrder.forEach(id => {
      const person = filtered.find(p => p.id === id);
      if (person) sorted.push(person);
    });
    
    // Add any people not in custom order
    filtered.forEach(person => {
      if (!customOrder.includes(person.id)) sorted.push(person);
    });
    
    return sorted;
  };

  // Show profile page
  if (viewingProfile) {
    return (
      <PersonProfile
        personId={viewingProfile}
        apiUrl={apiUrl}
        userNumber={userNumber}
        onClose={() => {
          setViewingProfile(null);
          fetchPeople();
        }}
        onDeleted={(personId) => {
          setPeople(people.filter(p => p.id !== personId));
          setViewingProfile(null);
        }}
      />
    );
  }

  // Main MyTeam view
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-slate-600">Loading your team...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">{t('team.title')}</h1>
          <p className="text-slate-600 mt-1">Manage your professional network</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {t('team.addPerson')}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {['all', 'team member', 'supervisor', 'mentor', 'peer'].map(filter => (
          <button
            key={filter}
            onClick={() => setRelationFilter(filter)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              relationFilter === filter
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1) + 's'}
          </button>
        ))}
      </div>

      {/* Add Person Form */}
      {showAddForm && (
        <div className="mb-6">
          <PersonForm
            onSubmit={addPerson}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* People List - Drag and Drop */}
      {getSortedPeople().length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-600 text-lg">
            No {relationFilter !== 'all' ? relationFilter + 's' : 'team members'} yet. Add people to your network!
          </p>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="people-list">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="space-y-2"
              >
                {getSortedPeople().map((person, index) => (
                  <Draggable
                    key={person.id}
                    draggableId={String(person.id)}
                    index={index}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`${snapshot.isDragging ? 'opacity-50' : ''}`}
                      >
                        {editingPersonId === person.id ? (
                          <PersonForm
                            person={person}
                            onSubmit={(data) => updatePerson(person.id, data)}
                            onCancel={() => setEditingPersonId(null)}
                            onDelete={() => deletePerson(person.id)}
                          />
                        ) : (
                          <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start gap-4">
                              {/* Drag Handle */}
                              <div
                                {...provided.dragHandleProps}
                                className="cursor-move text-gray-400 hover:text-gray-600 pt-1 flex-shrink-0"
                                title="Drag to reorder"
                              >
                                ::
                              </div>

                              {/* Person Info - Click to view profile */}
                              <div 
                                className="flex-1 cursor-pointer"
                                onClick={() => setViewingProfile(person.id)}
                              >
                                <h3 className="text-lg font-bold text-slate-800 hover:text-blue-600">
                                  {person.name}
                                </h3>
                                {person.relation && (
                                  <p className="text-sm text-slate-600">{person.relation}</p>
                                )}
                                {person.context && (
                                  <p className="mt-2 text-sm text-slate-600 line-clamp-2">{person.context}</p>
                                )}
                              </div>

                              <div className="flex items-center gap-2 text-slate-400">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingPersonId(person.id);
                                  }}
                                  className="p-1 rounded hover:bg-slate-200 transition"
                                  title="Edit"
                                  aria-label={`Edit ${person.name}`}
                                >
                                  <EditIcon />
                                </button>
                              </div>
                            </div>

                          </div>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}

function EditIcon() {
  return (
    <svg
      className="w-4 h-4 text-slate-500"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

// Person Profile Full Page View
function PersonProfile({ personId, apiUrl, userNumber, onClose, onDeleted }) {
  const [person, setPerson] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [synthesis, setSynthesis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedReviewId, setExpandedReviewId] = useState(null);
  const [synthesisExpanded, setSynthesisExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    fetchPersonData();
  }, [personId]);

  const fetchPersonData = async () => {
    try {
      // Fetch person details
      const peopleResponse = await axios.get(`${apiUrl}/api/journey/people`, {
        params: { user_number: userNumber }
      });
      const foundPerson = peopleResponse.data.find(p => p.id === personId);
      setPerson(foundPerson);

      // Fetch review history
      const reviewsResponse = await axios.get(
        `${apiUrl}/api/journey/people/${personId}/review-history`,
        { params: { user_number: userNumber } }
      );
      setReviews(reviewsResponse.data.reviews || []);

      // Generate synthesis
      await generateSynthesis(foundPerson, reviewsResponse.data.reviews || []);
    } catch (err) {
      console.error('Error fetching person profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateSynthesis = async (personData, reviewsData) => {
    try {
      const response = await axios.get(
        `${apiUrl}/api/journey/people/${personId}/synthesis`,
        { params: { user_number: userNumber } }
      );
      setSynthesis(response.data);
    } catch (err) {
      console.error('Error generating synthesis:', err);
      // Fallback to placeholder
      setSynthesis({
        strengths: ['Deep technical expertise', 'Collaborative mindset', 'Strong in crisis situations'],
        improvements: ['Needs clearer frameworks', 'Communication clarity', 'Reliability under pressure'],
        trajectory: 'Stable partnership, focus on delegation and independence'
      });
    }
  };

  const updateProfilePerson = async (updates) => {
    try {
      await axios.put(
        `${apiUrl}/api/journey/people/${personId}`,
        updates,
        { params: { user_number: userNumber } }
      );
      setIsEditing(false);
      await fetchPersonData();
    } catch (err) {
      console.error('Error updating person:', err);
      alert('Failed to update team member');
    }
  };

  const deleteProfilePerson = async () => {
    if (!confirm('Delete this person?')) return;

    try {
      await axios.delete(`${apiUrl}/api/journey/people/${personId}`, {
        params: { user_number: userNumber }
      });
      onDeleted?.(personId);
    } catch (err) {
      console.error('Error deleting person:', err);
      alert('Failed to delete team member');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading profile...</div>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-red-600">Person not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
          >
            ← Back to My Team
          </button>
          <h1 className="text-2xl font-bold text-slate-800">{person.name}</h1>
          <div className="w-24"></div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {isEditing && (
          <div className="mb-6">
            <PersonForm
              person={person}
              onSubmit={updateProfilePerson}
              onCancel={() => setIsEditing(false)}
              onDelete={deleteProfilePerson}
            />
          </div>
        )}

        <div className="mb-6 border-b border-slate-200">
          <div className="flex gap-6">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`relative px-2 pb-3 font-medium transition-colors ${
                activeTab === 'profile'
                  ? 'text-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              People Profile
              {activeTab === 'profile' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('review')}
              className={`relative px-2 pb-3 font-medium transition-colors ${
                activeTab === 'review'
                  ? 'text-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              People Review
              {activeTab === 'review' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          </div>
        </div>

        {activeTab === 'profile' && (
          <>
        {/* Person Info Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-3xl font-bold text-slate-800 mb-2">{person.name}</h2>
              {person.relation && (
                <p className="text-lg text-slate-600 mb-4">{person.relation}</p>
              )}
              {person.context && (
                <p className="text-slate-600 mb-4">{person.context}</p>
              )}
              {(person.strengths || person.growth_areas || person.aspirations) && (
                <div className="mb-4 grid gap-3 md:grid-cols-3">
                  {person.strengths && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Strengths</p>
                      <p className="mt-1 text-sm text-slate-700">{person.strengths}</p>
                    </div>
                  )}
                  {person.growth_areas && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Growth Areas</p>
                      <p className="mt-1 text-sm text-slate-700">{person.growth_areas}</p>
                    </div>
                  )}
                  {person.aspirations && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aspirations</p>
                      <p className="mt-1 text-sm text-slate-700">{person.aspirations}</p>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-4 text-sm text-slate-500">
                {person.email && (
                  <a href={`mailto:${person.email}`} className="hover:text-blue-600">
                    {person.email}
                  </a>
                )}
                {person.phone && (
                  <span>{person.phone}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditing(true)}
                className="h-10 inline-flex items-center justify-center rounded border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                title="Edit"
                aria-label={`Edit ${person.name}`}
              >
                Edit
              </button>
              <button
                onClick={deleteProfilePerson}
                className="h-10 inline-flex items-center justify-center rounded border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Alfred's Synthesis */}
        {synthesis && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              Alfred's Synthesis
            </h3>
            
            <button
              type="button"
              onClick={() => setSynthesisExpanded(!synthesisExpanded)}
              className="mb-4 text-sm font-medium text-slate-600 hover:text-slate-800"
            >
              {synthesisExpanded ? 'Hide synthesis' : 'Show synthesis'}
            </button>

            {synthesisExpanded && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-slate-700 mb-2">Core Strengths</h4>
                <ul className="list-disc list-inside text-slate-600 space-y-1">
                  {synthesis.strengths.map((strength, i) => (
                    <li key={i}>{strength}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-slate-700 mb-2">Improvement Opportunities</h4>
                <ul className="list-disc list-inside text-slate-600 space-y-1">
                  {synthesis.improvements.map((improvement, i) => (
                    <li key={i}>{improvement}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-slate-700 mb-2">Trajectory</h4>
                <p className="text-slate-600">{synthesis.trajectory}</p>
              </div>
            </div>
            )}
          </div>
        )}

        {/* Review History */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            Review History
          </h3>

          {reviews.length === 0 ? (
            <p className="text-slate-600">No reviews yet. Start your first review to build this relationship profile.</p>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-600">
                          {new Date(review.review_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </span>
                        {review.relationship_strength && (
                          <span className="text-sm font-medium text-slate-700">
                            Strength: {review.relationship_strength}/5
                          </span>
                        )}
                      </div>
                      {review.insights && (
                        <p className="text-sm text-slate-600 mt-2">{review.insights}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setExpandedReviewId(expandedReviewId === review.id ? null : review.id)}
                      className="text-sm text-slate-600 hover:text-slate-800 font-medium"
                    >
                      {expandedReviewId === review.id ? 'Hide' : 'View Full'}
                    </button>
                  </div>

                  {expandedReviewId === review.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 space-y-3 text-sm">
                      {review.recent_interactions && (
                        <div>
                          <span className="font-semibold text-slate-700">Recent Interactions:</span>
                          <p className="text-slate-600">{review.recent_interactions}</p>
                        </div>
                      )}
                      {review.current_dynamics && (
                        <div>
                          <span className="font-semibold text-slate-700">Current Dynamics:</span>
                          <p className="text-slate-600">{review.current_dynamics}</p>
                        </div>
                      )}
                      {review.strategic_importance && (
                        <div>
                          <span className="font-semibold text-slate-700">Strategic Importance:</span>
                          <p className="text-slate-600">{review.strategic_importance}</p>
                        </div>
                      )}
                      {review.mutual_value && (
                        <div>
                          <span className="font-semibold text-slate-700">Mutual Value:</span>
                          <p className="text-slate-600">{review.mutual_value}</p>
                        </div>
                      )}
                      {review.unresolved_issues && (
                        <div>
                          <span className="font-semibold text-slate-700">Unresolved Issues:</span>
                          <p className="text-slate-600">{review.unresolved_issues}</p>
                        </div>
                      )}
                      {review.patterns_noticed && (
                        <div>
                          <span className="font-semibold text-slate-700">Patterns Noticed:</span>
                          <p className="text-slate-600">{review.patterns_noticed}</p>
                        </div>
                      )}
                      {review.how_to_strengthen && (
                        <div>
                          <span className="font-semibold text-slate-700">How to Strengthen:</span>
                          <p className="text-slate-600">{review.how_to_strengthen}</p>
                        </div>
                      )}
                      {review.what_to_appreciate && (
                        <div>
                          <span className="font-semibold text-slate-700">What to Appreciate:</span>
                          <p className="text-slate-600">{review.what_to_appreciate}</p>
                        </div>
                      )}
                      {review.communication_plan && (
                        <div>
                          <span className="font-semibold text-slate-700">Communication Plan:</span>
                          <p className="text-slate-600">{review.communication_plan}</p>
                        </div>
                      )}
                      {review.next_steps && (
                        <div>
                          <span className="font-semibold text-slate-700">Next Steps:</span>
                          <p className="text-slate-600">{review.next_steps}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
          </>
        )}

        {activeTab === 'review' && (
          <PeopleReviewTab
            apiUrl={apiUrl}
            userNumber={userNumber}
            person={person}
            reviews={reviews}
          />
        )}
      </div>
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
          launchLabelByType={{ people_review: `Start People Review` }}
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
    return (
      <section className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
        No people reviews yet for {person.name}. Start one below to build a clearer relationship profile.
      </section>
    );
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
                {index === 0 ? 'Latest Review' : `Review ${reviews.length - index}`} - {new Date(review.review_date).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </summary>
              <div className="mt-4 space-y-3">
                {review.relationship_strength && (
                  <span className="inline-flex rounded border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                    Strength {review.relationship_strength}/5
                  </span>
                )}
                {review.insights && <PeopleReviewSummaryField title="Insight" value={review.insights} />}
                {review.patterns_noticed && <PeopleReviewSummaryField title="Pattern" value={review.patterns_noticed} />}
                {review.next_steps && <PeopleReviewSummaryField title="Next Steps" value={review.next_steps} />}
              </div>
            </details>
          ))}
        </div>
      </details>
    </section>
  );
}

function PeopleReviewSummaryField({ title, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

// Helper Components (PersonForm, HelpPanel - keep existing code)
function PersonForm({ person, onSubmit, onCancel, onDelete }) {
  const [formData, setFormData] = useState({
    name: person?.name || '',
    email: person?.email || '',
    phone: person?.phone || '',
    relation: person?.relation || '',
    context: person?.context || '',
    strengths: person?.strengths || '',
    growth_areas: person?.growth_areas || '',
    aspirations: person?.aspirations || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Please enter a name');
      return;
    }
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <h3 className="font-semibold text-slate-800">{person ? 'Edit Person' : 'Add Team Member'}</h3>
      
      <input
        type="text"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        placeholder="Name *"
        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        required
      />

      <input
        type="text"
        value={formData.relation}
        onChange={(e) => setFormData({ ...formData, relation: e.target.value })}
        placeholder="Relation (e.g., Colleague, Client, Mentor)"
        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <input
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        placeholder="Email"
        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <input
        type="tel"
        value={formData.phone}
        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        placeholder="Phone"
        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <textarea
        value={formData.context}
        onChange={(e) => setFormData({ ...formData, context: e.target.value })}
        placeholder="Context / Notes"
        rows={2}
        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <textarea
        value={formData.strengths}
        onChange={(e) => setFormData({ ...formData, strengths: e.target.value })}
        placeholder="Strengths"
        rows={2}
        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <textarea
        value={formData.growth_areas}
        onChange={(e) => setFormData({ ...formData, growth_areas: e.target.value })}
        placeholder="Weaknesses / growth areas"
        rows={2}
        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <textarea
        value={formData.aspirations}
        onChange={(e) => setFormData({ ...formData, aspirations: e.target.value })}
        placeholder="Aspirations"
        rows={2}
        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="flex gap-2">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          {person ? 'Save Changes' : 'Add Person'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors"
        >
          Cancel
        </button>
        {person && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors ml-auto"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
