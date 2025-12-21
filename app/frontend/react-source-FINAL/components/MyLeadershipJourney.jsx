import { useState, useEffect } from 'react';
import axios from 'axios';

export default function MyLeadershipJourney({ apiUrl, userNumber }) {
  const [data, setData] = useState({
    strengths: [],
    developmentAreas: [],
    projects: [],
    failures: [],
    values: [],
    achievements: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Track which items are being edited
  const [editing, setEditing] = useState({ type: null, id: null });
  const [adding, setAdding] = useState(null);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const endpoints = [
        { key: 'strengths', url: `${apiUrl}/api/journey/strengths` },
        { key: 'developmentAreas', url: `${apiUrl}/api/journey/development-areas` },
        { key: 'projects', url: `${apiUrl}/api/journey/projects` },
        { key: 'failures', url: `${apiUrl}/api/journey/failures` },
        { key: 'values', url: `${apiUrl}/api/journey/values` },
        { key: 'achievements', url: `${apiUrl}/api/journey/achievements` }
      ];

      const results = await Promise.all(
        endpoints.map(async ({ key, url }) => {
          try {
            const response = await axios.get(url, {
              params: { user_number: userNumber }
            });
            return { key, data: Array.isArray(response.data) ? response.data : [] };
          } catch (err) {
            console.error(`Error fetching ${key}:`, err);
            return { key, data: [] };
          }
        })
      );

      const newData = {};
      results.forEach(({ key, data }) => {
        newData[key] = data;
      });

      setData(newData);
    } catch (err) {
      console.error('Error fetching journey data:', err);
      setError('Failed to load journey data');
    } finally {
      setLoading(false);
    }
  };

  // Generic update function
  const updateItem = async (type, id, updates) => {
    const endpoints = {
      strengths: 'strengths',
      developmentAreas: 'development-areas',
      projects: 'projects',
      failures: 'failures',
      values: 'values',
      achievements: 'achievements'
    };
    
    try {
      await axios.put(
        `${apiUrl}/api/journey/${endpoints[type]}/${id}`,
        updates,
        { params: { user_number: userNumber } }
      );
      await fetchAllData();
      setEditing({ type: null, id: null });
    } catch (err) {
      console.error(`Error updating ${type}:`, err);
      alert(`Failed to update ${type}`);
    }
  };

  // Generic delete function
  const deleteItem = async (type, id) => {
    if (!confirm(`Delete this ${type.slice(0, -1)}?`)) return;
    
    const endpoints = {
      strengths: 'strengths',
      developmentAreas: 'development-areas',
      projects: 'projects',
      failures: 'failures',
      values: 'values',
      achievements: 'achievements'
    };
    
    try {
      await axios.delete(`${apiUrl}/api/journey/${endpoints[type]}/${id}`, {
        params: { user_number: userNumber }
      });
      await fetchAllData();
    } catch (err) {
      console.error(`Error deleting ${type}:`, err);
      alert(`Failed to delete ${type}`);
    }
  };


  const createItem = async (type, data) => {
    const endpoints = {
      strengths: 'strengths',
      developmentAreas: 'development-areas',
      projects: 'projects',
      failures: 'failures',
      values: 'values',
      achievements: 'achievements'
    };
    
    try {
      await axios.post(
        `${apiUrl}/api/journey/${endpoints[type]}`,
        data,
        { params: { user_number: userNumber } }
      );
      await fetchAllData();
      setAdding(null);
    } catch (err) {
      console.error(`Error creating ${type}:`, err);
      alert(`Failed to create ${type}`);
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
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-800">My Leadership Journey</h1>
        <p className="text-slate-600 mt-1">Your professional growth and development</p>
      </div>

      {/* 1. Strengths */}
      <Section title="Strengths" color="gray" isEmpty={data.strengths.length === 0} onAdd={() => setAdding('strengths')}>
        {adding === 'strengths' && (
          <SimpleAddForm
            fields={[
              { name: 'title', type: 'text', placeholder: 'Title (optional)', required: false },
              { name: 'strength', type: 'textarea', placeholder: 'Describe your strength', required: true, rows: 2 },
              { name: 'source', type: 'text', placeholder: 'Source (optional)', required: false }
            ]}
            onSubmit={(data) => createItem('strengths', data)}
            onCancel={() => setAdding(null)}
            color="gray"
          />
        )}
        {data.strengths.length === 0 ? (
          <EmptyState message="No strengths captured yet" />
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {data.strengths.map((item) => (
              <EditableCard
                key={item.id}
                item={item}
                type="strengths"
                color="gray"
                isEditing={editing.type === 'strengths' && editing.id === item.id}
                onEdit={() => setEditing({ type: 'strengths', id: item.id })}
                onCancel={() => setEditing({ type: null, id: null })}
                onUpdate={(updates) => updateItem('strengths', item.id, updates)}
                onDelete={() => deleteItem('strengths', item.id)}
                renderView={() => (
                  <>
                    {item.title && (
                      <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
                    )}
                    <p className="text-slate-800 font-medium">{item.strength}</p>
                    {item.source && (
                      <p className="text-sm text-slate-600 mt-2">
                        <span className="font-medium">Source:</span> {item.source}
                      </p>
                    )}
                  </>
                )}
                renderEdit={(formData, setFormData) => (
                  <>
                    <input
                      type="text"
                      value={formData.title || ''}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
                      placeholder="Title (optional)"
                    />
                    <textarea
                      value={formData.strength || ''}
                      onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
                      placeholder="Strength"
                      rows={2}
                    />
                    <input
                      type="text"
                      value={formData.source || ''}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
                      placeholder="Source (optional)"
                    />
                  </>
                )}
              />
            ))}
          </div>
        )}
      </Section>

      {/* 2. Development Areas */}
      <Section title="Development Areas" color="gray" isEmpty={data.developmentAreas.length === 0} onAdd={() => setAdding('developmentAreas')}>
        {adding === 'developmentAreas' && (
          <SimpleAddForm
            fields={[
              { name: 'title', type: 'text', placeholder: 'Title (optional)', required: false },
              { name: 'skill', type: 'textarea', placeholder: 'Skill to develop', required: true, rows: 2 },
              { name: 'source', type: 'text', placeholder: 'Source (optional)', required: false }
            ]}
            onSubmit={(data) => createItem('developmentAreas', data)}
            onCancel={() => setAdding(null)}
            color="gray"
          />
        )}
        {data.developmentAreas.length === 0 ? (
          <EmptyState message="No development areas captured yet" />
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {data.developmentAreas.map((item) => (
              <EditableCard
                key={item.id}
                item={item}
                type="developmentAreas"
                color="gray"
                isEditing={editing.type === 'developmentAreas' && editing.id === item.id}
                onEdit={() => setEditing({ type: 'developmentAreas', id: item.id })}
                onCancel={() => setEditing({ type: null, id: null })}
                onUpdate={(updates) => updateItem('developmentAreas', item.id, updates)}
                onDelete={() => deleteItem('developmentAreas', item.id)}
                renderView={() => (
                  <>
                    {item.title && (
                      <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
                    )}
                    <p className="text-slate-800 font-medium">{item.skill}</p>
                    {item.source && (
                      <p className="text-sm text-slate-600 mt-2">
                        <span className="font-medium">Source:</span> {item.source}
                      </p>
                    )}
                  </>
                )}
                renderEdit={(formData, setFormData) => (
                  <>
                    <input
                      type="text"
                      value={formData.title || ''}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
                      placeholder="Title (optional)"
                    />
                    <textarea
                      value={formData.skill || ''}
                      onChange={(e) => setFormData({ ...formData, skill: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
                      placeholder="Skill to develop"
                      rows={2}
                    />
                    <input
                      type="text"
                      value={formData.source || ''}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
                      placeholder="Source (optional)"
                    />
                  </>
                )}
              />
            ))}
          </div>
        )}
      </Section>

      {/* 3. Projects */}
      <Section title="Projects" color="gray" isEmpty={data.projects.length === 0} onAdd={() => setAdding('projects')}>
        {adding === 'projects' && (
          <SimpleAddForm
            fields={[
              { name: 'project_name', type: 'text', placeholder: 'Project name', required: true },
              { name: 'goal', type: 'textarea', placeholder: 'Goal (optional)', required: false, rows: 2 },
              { name: 'description', type: 'textarea', placeholder: 'Description (optional)', required: false, rows: 2 },
              { name: 'status', type: 'select', required: true, default: 'active', options: ['active', 'paused', 'completed'] }
            ]}
            onSubmit={(data) => createItem('projects', data)}
            onCancel={() => setAdding(null)}
            color="gray"
          />
        )}
        {data.projects.length === 0 ? (
          <EmptyState message="No projects captured yet" />
        ) : (
          <div className="space-y-4">
            {data.projects.map((item) => (
              <EditableCard
                key={item.id}
                item={item}
                type="projects"
                color="gray"
                isEditing={editing.type === 'projects' && editing.id === item.id}
                onEdit={() => setEditing({ type: 'projects', id: item.id })}
                onCancel={() => setEditing({ type: null, id: null })}
                onUpdate={(updates) => updateItem('projects', item.id, updates)}
                onDelete={() => deleteItem('projects', item.id)}
                renderView={() => (
                  <>
                    <h3 className="font-bold text-slate-800 mb-2">{item.project_name}</h3>
                    {item.goal && (
                      <p className="text-sm text-slate-700 mb-2">
                        <span className="font-medium">Goal:</span> {item.goal}
                      </p>
                    )}
                    {item.description && (
                      <p className="text-sm text-slate-600 mb-2">{item.description}</p>
                    )}
                    {item.status && (
                      <span className="inline-block px-2 py-1 bg-blue-200 text-blue-800 rounded text-xs font-medium">
                        {item.status}
                      </span>
                    )}
                  </>
                )}
                renderEdit={(formData, setFormData) => (
                  <>
                    <input
                      type="text"
                      value={formData.project_name || ''}
                      onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 font-semibold"
                      placeholder="Project name"
                    />
                    <textarea
                      value={formData.goal || ''}
                      onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                      placeholder="Goal (optional)"
                      rows={2}
                    />
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                      placeholder="Description (optional)"
                      rows={2}
                    />
                    <select
                      value={formData.status || 'active'}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                    </select>
                  </>
                )}
              />
            ))}
          </div>
        )}
      </Section>

      {/* 4. Failures & Learnings */}
      <Section title="Failures & Learnings" color="gray" isEmpty={data.failures.length === 0} onAdd={() => setAdding('failures')}>
        {adding === 'failures' && (
          <SimpleAddForm
            fields={[
              { name: 'title', type: 'text', placeholder: 'Title (optional)', required: false },
              { name: 'failure_text', type: 'textarea', placeholder: 'What happened?', required: true, rows: 2 },
              { name: 'learning', type: 'textarea', placeholder: 'What did you learn?', required: false, rows: 2 },
              { name: 'scar', type: 'textarea', placeholder: 'Emotional impact (optional)', required: false, rows: 2 }
            ]}
            onSubmit={(data) => createItem('failures', data)}
            onCancel={() => setAdding(null)}
            color="gray"
          />
        )}
        {data.failures.length === 0 ? (
          <EmptyState message="No failures captured yet" />
        ) : (
          <div className="space-y-4">
            {data.failures.map((item) => (
              <EditableCard
                key={item.id}
                item={item}
                type="failures"
                color="gray"
                isEditing={editing.type === 'failures' && editing.id === item.id}
                onEdit={() => setEditing({ type: 'failures', id: item.id })}
                onCancel={() => setEditing({ type: null, id: null })}
                onUpdate={(updates) => updateItem('failures', item.id, updates)}
                onDelete={() => deleteItem('failures', item.id)}
                renderView={() => (
                  <>
                    {item.title && (
                      <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
                    )}
                    <p className="text-slate-800 mb-3">{item.failure_text}</p>
                    {item.learning && (
                      <div className="bg-white rounded p-3 mb-2">
                        <p className="text-sm font-medium text-slate-700 mb-1">Learning:</p>
                        <p className="text-sm text-slate-600">{item.learning}</p>
                      </div>
                    )}
                    {item.scar && (
                      <div className="bg-white rounded p-3">
                        <p className="text-sm font-medium text-slate-700 mb-1">Scar:</p>
                        <p className="text-sm text-slate-600">{item.scar}</p>
                      </div>
                    )}
                  </>
                )}
                renderEdit={(formData, setFormData) => (
                  <>
                    <input
                      type="text"
                      value={formData.title || ''}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
                      placeholder="Title (optional)"
                    />
                    <textarea
                      value={formData.failure_text || ''}
                      onChange={(e) => setFormData({ ...formData, failure_text: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
                      placeholder="What happened?"
                      rows={2}
                    />
                    <textarea
                      value={formData.learning || ''}
                      onChange={(e) => setFormData({ ...formData, learning: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
                      placeholder="What did you learn?"
                      rows={2}
                    />
                    <textarea
                      value={formData.scar || ''}
                      onChange={(e) => setFormData({ ...formData, scar: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
                      placeholder="Emotional impact/scar (optional)"
                      rows={2}
                    />
                  </>
                )}
              />
            ))}
          </div>
        )}
      </Section>

      {/* 5. Values */}
      <Section title="Values" color="gray" isEmpty={data.values.length === 0} onAdd={() => setAdding('values')}>
        {adding === 'values' && (
          <SimpleAddForm
            fields={[
              { name: 'title', type: 'text', placeholder: 'Value title', required: true },
              { name: 'value_text', type: 'textarea', placeholder: 'Describe this value', required: true, rows: 2 },
              { name: 'why', type: 'textarea', placeholder: 'Why is this important to you?', required: false, rows: 2 }
            ]}
            onSubmit={(data) => createItem('values', data)}
            onCancel={() => setAdding(null)}
            color="gray"
          />
        )}
        {data.values.length === 0 ? (
          <EmptyState message="No values captured yet" />
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {data.values.map((item) => (
              <EditableCard
                key={item.id}
                item={item}
                type="values"
                color="gray"
                isEditing={editing.type === 'values' && editing.id === item.id}
                onEdit={() => setEditing({ type: 'values', id: item.id })}
                onCancel={() => setEditing({ type: null, id: null })}
                onUpdate={(updates) => updateItem('values', item.id, updates)}
                onDelete={() => deleteItem('values', item.id)}
                renderView={() => (
                  <>
                    <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
                    <p className="text-slate-700 mb-2">{item.value_text}</p>
                    {item.why && (
                      <p className="text-slate-600 text-sm italic">{item.why}</p>
                    )}
                  </>
                )}
                renderEdit={(formData, setFormData) => (
                  <>
                    <input
                      type="text"
                      value={formData.title || ''}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
                      placeholder="Title"
                    />
                    <textarea
                      value={formData.value_text || ''}
                      onChange={(e) => setFormData({ ...formData, value_text: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
                      placeholder="Value description"
                      rows={2}
                    />
                    <textarea
                      value={formData.why || ''}
                      onChange={(e) => setFormData({ ...formData, why: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
                      placeholder="Why important (optional)"
                      rows={2}
                    />
                  </>
                )}
              />
            ))}
          </div>
        )}
      </Section>

      {/* 6. Greatest Achievements */}
      <Section title="Greatest Achievements" color="gray" isEmpty={data.achievements.length === 0} onAdd={() => setAdding('achievements')}>
        {adding === 'achievements' && (
          <SimpleAddForm
            fields={[
              { name: 'title', type: 'text', placeholder: 'Achievement title', required: true },
              { name: 'achievement_text', type: 'textarea', placeholder: 'Describe the achievement', required: true, rows: 2 },
              { name: 'impact', type: 'textarea', placeholder: 'Impact (optional)', required: false, rows: 2 }
            ]}
            onSubmit={(data) => createItem('achievements', data)}
            onCancel={() => setAdding(null)}
            color="gray"
          />
        )}
        {data.achievements.length === 0 ? (
          <EmptyState message="No achievements captured yet" />
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {data.achievements.map((item) => (
              <EditableCard
                key={item.id}
                item={item}
                type="achievements"
                color="gray"
                isEditing={editing.type === 'achievements' && editing.id === item.id}
                onEdit={() => setEditing({ type: 'achievements', id: item.id })}
                onCancel={() => setEditing({ type: null, id: null })}
                onUpdate={(updates) => updateItem('achievements', item.id, updates)}
                onDelete={() => deleteItem('achievements', item.id)}
                renderView={() => (
                  <>
                    <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
                    <p className="text-slate-700 mb-2">{item.achievement_text}</p>
                    {item.impact && (
                      <p className="text-slate-600 text-sm"><strong>Impact:</strong> {item.impact}</p>
                    )}
                  </>
                )}
                renderEdit={(formData, setFormData) => (
                  <>
                    <input
                      type="text"
                      value={formData.title || ''}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
                      placeholder="Title"
                    />
                    <textarea
                      value={formData.achievement_text || ''}
                      onChange={(e) => setFormData({ ...formData, achievement_text: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
                      placeholder="Achievement description"
                      rows={2}
                    />
                    <textarea
                      value={formData.impact || ''}
                      onChange={(e) => setFormData({ ...formData, impact: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
                      placeholder="Impact (optional)"
                      rows={2}
                    />
                  </>
                )}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// Section Component
function Section({ title, color, isEmpty, children, onAdd }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
          >
            <span className="text-lg">+</span>
            <span>Add</span>
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// Editable Card Component
function EditableCard({ 
  item, 
  type, 
  color, 
  isEditing, 
  onEdit, 
  onCancel, 
  onUpdate, 
  onDelete,
  renderView,
  renderEdit
}) {
  const [formData, setFormData] = useState(item);

  const colorClasses = {
    green: 'bg-white border-gray-200',
    amber: 'bg-white border-gray-200',
    blue: 'bg-white border-gray-200',
    red: 'bg-white border-gray-200',
    indigo: 'bg-white border-gray-200'
  };

  const handleSubmit = () => {
    onUpdate(formData);
  };

  if (isEditing) {
    return (
      <div className={`${colorClasses[color]} border-2 rounded-lg p-4 space-y-3`}>
        {renderEdit(formData, setFormData)}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSubmit}
            className="flex-1 bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded text-sm font-medium"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1.5 rounded text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={onEdit}
    >
      {renderView()}
    </div>
  );
}

// Empty State Component
function EmptyState({ message }) {
  return (
    <div className="text-center py-8 text-slate-500">
      {message}
    </div>
  );
}

// Simple Add Form Component
function SimpleAddForm({ fields, onSubmit, onCancel, color }) {
  const [formData, setFormData] = useState(
    fields.reduce((acc, field) => ({ ...acc, [field.name]: field.default || '' }), {})
  );

  const colorClasses = {
    green: 'bg-white border-gray-200',
    amber: 'bg-white border-gray-200',
    blue: 'bg-white border-gray-200',
    red: 'bg-white border-gray-200',
    indigo: 'bg-white border-gray-200'
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className={`${colorClasses[color]} border-2 rounded-lg p-4 mb-4 space-y-3`}>
      <h3 className="font-semibold text-slate-800">Add New Item</h3>
      {fields.map(field => (
        <div key={field.name}>
          {field.type === 'textarea' ? (
            <textarea
              value={formData[field.name]}
              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
              placeholder={field.placeholder}
              rows={field.rows || 2}
              required={field.required}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            />
          ) : field.type === 'select' ? (
            <select
              value={formData[field.name]}
              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
              required={field.required}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            >
              {field.options.map(opt => (
                <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={formData[field.name]}
              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
              placeholder={field.placeholder}
              required={field.required}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium">
          Add
        </button>
        <button type="button" onClick={onCancel} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}
