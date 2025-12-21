import { useState, useEffect } from 'react';
import axios from 'axios';

export default function MyTeam({ apiUrl, userNumber }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState(null);
  const [askingHelpFrom, setAskingHelpFrom] = useState(null);
  const [relationFilter, setRelationFilter] = useState('all'); // New: filter by relation type

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
    } catch (err) {
      console.error('Error deleting person:', err);
      alert('Failed to delete team member');
    }
  };

  const createTaskForHelp = async (personName, helpDescription) => {
    try {
      const taskData = {
        title: `Ask ${personName} for help`,
        notes: helpDescription,
        delegated_to: personName,
        priority: 'medium',
        status: 'open'
      };
      
      await axios.post(
        `${apiUrl}/api/tasks/`,
        taskData,
        { params: { user_number: userNumber } }
      );
      
      setAskingHelpFrom(null);
      alert('Task created! Check your Todo list.');
    } catch (err) {
      console.error('Error creating task:', err);
      alert('Failed to create task');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">My Team</h1>
          <p className="text-slate-600 mt-1">People who can support you in your journey</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + Add Person
        </button>
      </div>

      {showAddForm && (
        <PersonForm
          onSubmit={addPerson}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Relation Type Filters */}
      <div className="mb-6 flex gap-3">
        <button
          onClick={() => setRelationFilter('all')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            relationFilter === 'all'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          All ({people.length})
        </button>
        <button
          onClick={() => setRelationFilter('team member')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            relationFilter === 'team member'
              ? 'bg-green-600 text-white shadow-lg'
              : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Team Members ({people.filter(p => p.relation?.toLowerCase().includes('team')).length})
        </button>
        <button
          onClick={() => setRelationFilter('supervisor')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            relationFilter === 'supervisor'
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Supervisors ({people.filter(p => p.relation?.toLowerCase().includes('supervisor')).length})
        </button>
        <button
          onClick={() => setRelationFilter('mentor')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            relationFilter === 'mentor'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Mentors ({people.filter(p => p.relation?.toLowerCase().includes('mentor')).length})
        </button>
        <button
          onClick={() => setRelationFilter('peer')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            relationFilter === 'peer'
              ? 'bg-amber-600 text-white shadow-lg'
              : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Peers ({people.filter(p => p.relation?.toLowerCase().includes('peer') || p.relation?.toLowerCase().includes('colleague')).length})
        </button>
      </div>

      {/* People List */}
      {people.filter(person => {
        if (relationFilter === 'all') return true;
        if (relationFilter === 'team member') return person.relation?.toLowerCase().includes('team');
        if (relationFilter === 'supervisor') return person.relation?.toLowerCase().includes('supervisor');
        if (relationFilter === 'mentor') return person.relation?.toLowerCase().includes('mentor');
        if (relationFilter === 'peer') return person.relation?.toLowerCase().includes('peer') || person.relation?.toLowerCase().includes('colleague');
        return true;
      }).length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-600 text-lg">
            No {relationFilter !== 'all' ? relationFilter + 's' : 'team members'} yet. Add people to your network!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {people.filter(person => {
            if (relationFilter === 'all') return true;
            if (relationFilter === 'team member') return person.relation?.toLowerCase().includes('team');
            if (relationFilter === 'supervisor') return person.relation?.toLowerCase().includes('supervisor');
            if (relationFilter === 'mentor') return person.relation?.toLowerCase().includes('mentor');
            if (relationFilter === 'peer') return person.relation?.toLowerCase().includes('peer') || person.relation?.toLowerCase().includes('colleague');
            return true;
          }).map((person) => (
            editingPersonId === person.id ? (
              <PersonForm
                key={person.id}
                person={person}
                onSubmit={(data) => updatePerson(person.id, data)}
                onCancel={() => setEditingPersonId(null)}
                onDelete={() => deletePerson(person.id)}
              />
            ) : (
              <div
                key={person.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-6">
                  {/* Left: Person Info (Name + Relation) */}
                  <div 
                    className="cursor-pointer"
                    onClick={() => setEditingPersonId(person.id)}
                  >
                    <h3 className="text-lg font-bold text-slate-800">{person.name}</h3>
                    {person.relation && (
                      <p className="text-sm text-slate-600">{person.relation}</p>
                    )}
                  </div>

                  {/* Middle: Context/Notes */}
                  {person.context && (
                    <div 
                      className="flex-1 text-sm text-slate-600 cursor-pointer"
                      onClick={() => setEditingPersonId(person.id)}
                    >
                      {person.context}
                    </div>
                  )}

                  {/* Right: Action Icons */}
                  <div className="flex items-center gap-4 text-slate-400">
                    {/* View Tasks Link - Icon Only */}
                    <a
                      href={`/?page=todo-list&delegate=${encodeURIComponent(person.name)}`}
                      onClick={(e) => {
                        e.preventDefault();
                        window.location.href = `/?page=todo-list&delegate=${encodeURIComponent(person.name)}`;
                      }}
                      className="hover:text-blue-600 transition-colors text-2xl"
                      title="View tasks"
                    >
                      📋
                    </a>

                    {/* Ask for Help Button - Icon Only */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAskingHelpFrom(askingHelpFrom === person.id ? null : person.id);
                      }}
                      className="hover:text-green-600 transition-colors text-2xl"
                      title="Ask for help"
                    >
                      🤝
                    </button>
                  </div>
                </div>

                {/* Help Panel - Appears Below When Active */}
                {askingHelpFrom === person.id && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <HelpPanel
                      personName={person.name}
                      onSubmit={(description) => createTaskForHelp(person.name, description)}
                      onCancel={() => setAskingHelpFrom(null)}
                    />
                  </div>
                )}
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}

function PersonForm({ person, onSubmit, onCancel, onDelete }) {
  const [formData, setFormData] = useState({
    name: person?.name || '',
    email: person?.email || '',
    phone: person?.phone || '',
    relation: person?.relation || '',
    context: person?.context || ''
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
    <form onSubmit={handleSubmit} className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 space-y-3">
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
        rows={3}
        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded font-medium"
        >
          Cancel
        </button>
        {person && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

function HelpPanel({ personName, onSubmit, onCancel }) {
  const [helpText, setHelpText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!helpText.trim()) {
      alert('Please describe what you need help with');
      return;
    }
    onSubmit(helpText);
    setHelpText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="mt-3 bg-green-50 border-2 border-green-300 rounded-lg p-4 space-y-3">
      <h4 className="font-semibold text-slate-800">What do you need help with?</h4>
      <form onSubmit={handleSubmit}>
        <textarea
          value={helpText}
          onChange={(e) => setHelpText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Describe what ${personName} can help you with... (Press Enter to create task)`}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
          autoFocus
        />
        <div className="flex gap-2 mt-2">
          <button
            type="submit"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium"
          >
            Create Task
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
