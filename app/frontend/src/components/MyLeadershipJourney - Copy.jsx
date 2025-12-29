import React, { useState, useEffect } from "react";
import axios from "axios";

const CENTER = { x: 600, y: 600 };
const R_CENTER = 150;
const R_MIDDLE = 300;
const R_OUTER = 480;

const DIMENSIONS = [
  {
    name: "Vision & Meaning",
    topics: ["Strengths", "Values", "Goals"],
  },
  {
    name: "Prioritization & Execution",
    topics: ["Projects", "Tasks", "Delegation"],
  },
  {
    name: "People Development",
    topics: ["Key People", "Feedback", "Coaching Moments"],
  },
  {
    name: "Time & Energy",
    topics: ["Energy Sources", "Recovery", "Boundaries"],
  },
  {
    name: "Learning & Development",
    topics: [
      "Failures & Scars",
      "Development Opportunities",
      "Patterns & Insights",
    ],
  },
];

// Map topics to database endpoints
const TOPIC_ENDPOINTS = {
  "Strengths": "strengths",
  "Values": "values",
  "Goals": "goals",
  "Projects": "projects",
  "Key People": "people",
  "Failures & Scars": "failures",
  "Development Opportunities": "development-areas"
};

function polar(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(a),
    y: cy + r * Math.sin(a),
  };
}

function wedgePath(r1, r2, a1, a2) {
  const p1 = polar(CENTER.x, CENTER.y, r2, a1);
  const p2 = polar(CENTER.x, CENTER.y, r2, a2);
  const p3 = polar(CENTER.x, CENTER.y, r1, a2);
  const p4 = polar(CENTER.x, CENTER.y, r1, a1);

  return `
    M ${p1.x} ${p1.y}
    A ${r2} ${r2} 0 0 1 ${p2.x} ${p2.y}
    L ${p3.x} ${p3.y}
    A ${r1} ${r1} 0 0 0 ${p4.x} ${p4.y}
    Z
  `;
}

export default function MyLeadershipJourney({ apiUrl, userNumber }) {
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [topicData, setTopicData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState({ type: null, id: null });

  const anglePerDim = 360 / DIMENSIONS.length;

  const handleTopicClick = async (topic) => {
    const endpoint = TOPIC_ENDPOINTS[topic];
    
    if (!endpoint) {
      console.log("No database endpoint for topic:", topic);
      return;
    }

    setSelectedTopic(topic);
    setLoading(true);

    try {
      const response = await axios.get(`${apiUrl}/api/journey/${endpoint}`, {
        params: { user_number: userNumber }
      });
      
      // Handle response that might be wrapped in {data: []} or just []
      const data = response.data?.data || response.data || [];
      setTopicData(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(`Error fetching ${topic}:`, err);
      setTopicData([]);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedTopic(null);
    setTopicData([]);
    setEditing({ type: null, id: null });
  };

  const updateItem = async (id, updates) => {
    const endpoint = TOPIC_ENDPOINTS[selectedTopic];
    
    try {
      await axios.put(
        `${apiUrl}/api/journey/${endpoint}/${id}`,
        updates,
        { params: { user_number: userNumber } }
      );
      
      // Refresh data
      const response = await axios.get(`${apiUrl}/api/journey/${endpoint}`, {
        params: { user_number: userNumber }
      });
      const data = response.data?.data || response.data || [];
      setTopicData(Array.isArray(data) ? data : []);
      setEditing({ type: null, id: null });
    } catch (err) {
      console.error(`Error updating ${selectedTopic}:`, err);
      alert(`Failed to update ${selectedTopic}`);
    }
  };

  const deleteItem = async (id) => {
    if (!confirm(`Delete this ${selectedTopic.toLowerCase()}?`)) return;
    
    const endpoint = TOPIC_ENDPOINTS[selectedTopic];
    
    try {
      await axios.delete(`${apiUrl}/api/journey/${endpoint}/${id}`, {
        params: { user_number: userNumber }
      });
      
      // Refresh data
      const response = await axios.get(`${apiUrl}/api/journey/${endpoint}`, {
        params: { user_number: userNumber }
      });
      const data = response.data?.data || response.data || [];
      setTopicData(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(`Error deleting ${selectedTopic}:`, err);
      alert(`Failed to delete ${selectedTopic}`);
    }
  };

  return (
    <div className="px-2 md:px-10 py-4 md:py-8">
      {/* Page title */}
      <h1 className="text-2xl md:text-3xl font-semibold text-slate-800 mb-1 md:mb-2">
        My Leadership Journey
      </h1>
      <p className="text-sm md:text-base text-slate-600 mb-4 md:mb-6">Understanding your journey to shape your future</p>

      <div className="flex justify-center items-start">
        <svg 
          viewBox="0 0 1200 1200" 
          className="w-full md:max-w-[700px] lg:max-w-[900px] h-auto"
        >
          {/* Center */}
          <circle cx={600} cy={600} r={R_CENTER} fill="#0F172A" />
          <text
            x={600}
            y={575}
            textAnchor="middle"
            fontSize="42"
            fill="white"
            fontWeight="600"
          >
            Alfred
          </text>
          <text
            x={600}
            y={625}
            textAnchor="middle"
            fontSize="24"
            fill="#CBD5E1"
          >
            Leadership Model
          </text>

          {DIMENSIONS.map((dim, i) => {
            const start = i * anglePerDim;
            const end = start + anglePerDim;
            const topicAngle = anglePerDim / dim.topics.length;

            // middle label position
            const midAngle = (start + end) / 2;
            const labelPos = polar(600, 600, 225, midAngle);

            return (
              <g key={dim.name}>
                {/* Middle ring */}
                <path
                  d={wedgePath(R_CENTER, R_MIDDLE, start, end)}
                  fill="#CBD5E1"
                  stroke="#E2E8F0"
                  strokeWidth="1.2"
                />

                {/* Dimension label */}
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  fontSize="18"
                  fill="#0F172A"
                  fontWeight="500"
                  style={{ wordSpacing: '100vw' }}
                >
                  {dim.name.split(' ').map((word, idx) => (
                    <tspan key={idx} x={labelPos.x} dy={idx === 0 ? 0 : 20}>
                      {word}
                    </tspan>
                  ))}
                </text>

                {/* Topic wedges */}
                {dim.topics.map((topic, j) => {
                  const tStart = start + j * topicAngle;
                  const tEnd = tStart + topicAngle;
                  const tMiddle = (tStart + tEnd) / 2;
                  
                  // Position for topic label in outer ring
                  const topicLabelPos = polar(600, 600, 390, tMiddle);

                  return (
                    <g key={topic}>
                      {/* Topic wedge */}
                      <path
                        d={wedgePath(R_MIDDLE, R_OUTER, tStart, tEnd)}
                        fill="#E5E7EB"
                        stroke="#CBD5E1"
                        strokeWidth="1"
                        className="cursor-pointer hover:fill-slate-300 transition-colors"
                        onClick={() => handleTopicClick(topic)}
                      />
                      
                      {/* Topic label */}
                      <text
                        x={topicLabelPos.x}
                        y={topicLabelPos.y}
                        textAnchor="middle"
                        fontSize="16"
                        fill="#1e293b"
                        fontWeight="500"
                        className="pointer-events-none"
                      >
                        {topic}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Modal */}
      {selectedTopic && (
        <TopicModal
          topic={selectedTopic}
          data={topicData}
          loading={loading}
          editing={editing}
          onClose={closeModal}
          onEdit={(id) => setEditing({ type: selectedTopic, id })}
          onCancelEdit={() => setEditing({ type: null, id: null })}
          onUpdate={updateItem}
          onDelete={deleteItem}
        />
      )}
    </div>
  );
}

// Topic Modal Component
function TopicModal({ topic, data, loading, editing, onClose, onEdit, onCancelEdit, onUpdate, onDelete }) {
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden pointer-events-auto flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="sticky top-0 bg-slate-800 text-white px-6 py-4 flex items-center justify-between border-b border-slate-700">
            <h2 className="text-xl font-semibold">{topic}</h2>
            <button
              onClick={onClose}
              className="text-slate-300 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center"
            >
              ×
            </button>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : data.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                No {topic.toLowerCase()} captured yet. Share them with Alfred to see them here!
              </div>
            ) : (
              <div className="space-y-4">
                {data.map((item, index) => (
                  <TopicCard 
                    key={item.id || index} 
                    topic={topic} 
                    item={item}
                    isEditing={editing.type === topic && editing.id === item.id}
                    onEdit={() => onEdit(item.id)}
                    onCancelEdit={onCancelEdit}
                    onUpdate={onUpdate}
                    onDelete={() => onDelete(item.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="sticky bottom-0 bg-slate-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Topic Card Component - renders different fields based on topic type
function TopicCard({ topic, item, isEditing, onEdit, onCancelEdit, onUpdate, onDelete }) {
  const [formData, setFormData] = useState(item);

  const handleSubmit = () => {
    onUpdate(item.id, formData);
  };

  const renderEditForm = () => {
    switch (topic) {
      case "Strengths":
        return (
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
        );

      case "Values":
        return (
          <>
            <input
              type="text"
              value={formData.title || ''}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Title (optional)"
            />
            <textarea
              value={formData.value_text || ''}
              onChange={(e) => setFormData({ ...formData, value_text: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Value"
              rows={2}
            />
            <textarea
              value={formData.why || ''}
              onChange={(e) => setFormData({ ...formData, why: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
              placeholder="Why it matters (optional)"
              rows={2}
            />
          </>
        );

      case "Goals":
        return (
          <>
            <input
              type="text"
              value={formData.title || ''}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Title (optional)"
            />
            <textarea
              value={formData.goal_text || ''}
              onChange={(e) => setFormData({ ...formData, goal_text: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Goal"
              rows={2}
            />
            <select
              value={formData.time_horizon || ''}
              onChange={(e) => setFormData({ ...formData, time_horizon: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
            >
              <option value="">No time horizon</option>
              <option value="short">Short term</option>
              <option value="medium">Medium term</option>
              <option value="long">Long term</option>
            </select>
            <textarea
              value={formData.why || ''}
              onChange={(e) => setFormData({ ...formData, why: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
              placeholder="Why (optional)"
              rows={2}
            />
          </>
        );

      case "Projects":
        return (
          <>
            <input
              type="text"
              value={formData.project_name || ''}
              onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Project name"
            />
            <textarea
              value={formData.goal || ''}
              onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Goal (optional)"
              rows={2}
            />
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Description (optional)"
              rows={2}
            />
            <select
              value={formData.status || ''}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
            >
              <option value="">No status</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </>
        );

      case "Key People":
        return (
          <>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Name"
            />
            <input
              type="text"
              value={formData.relation || ''}
              onChange={(e) => setFormData({ ...formData, relation: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Relation (optional)"
            />
            <input
              type="email"
              value={formData.email || ''}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Email (optional)"
            />
            <input
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Phone (optional)"
            />
            <textarea
              value={formData.context || ''}
              onChange={(e) => setFormData({ ...formData, context: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
              placeholder="Context (optional)"
              rows={2}
            />
          </>
        );

      case "Failures & Scars":
        return (
          <>
            <textarea
              value={formData.failure_text || ''}
              onChange={(e) => setFormData({ ...formData, failure_text: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Failure"
              rows={2}
            />
            <textarea
              value={formData.learning || ''}
              onChange={(e) => setFormData({ ...formData, learning: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Learning (optional)"
              rows={2}
            />
            <textarea
              value={formData.scar || ''}
              onChange={(e) => setFormData({ ...formData, scar: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
              placeholder="Scar (optional)"
              rows={2}
            />
          </>
        );

      case "Development Opportunities":
        return (
          <>
            <textarea
              value={formData.skill || ''}
              onChange={(e) => setFormData({ ...formData, skill: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Skill"
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
        );

      default:
        return null;
    }
  };

  const renderContent = () => {
    switch (topic) {
      case "Strengths":
        return (
          <>
            {item.title && (
              <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
            )}
            <p className="text-slate-800 font-medium mb-2">{item.strength}</p>
            {item.source && (
              <p className="text-sm text-slate-600">
                <span className="font-medium">Source:</span> {item.source}
              </p>
            )}
          </>
        );

      case "Values":
        return (
          <>
            {item.title && (
              <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
            )}
            <p className="text-slate-800 font-medium mb-2">{item.value_text}</p>
            {item.why && (
              <div className="bg-slate-50 p-3 rounded mt-2">
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Why it matters:</span> {item.why}
                </p>
              </div>
            )}
          </>
        );

      case "Goals":
        return (
          <>
            {item.title && (
              <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
            )}
            <p className="text-slate-800 font-medium mb-2">{item.goal_text}</p>
            {item.time_horizon && (
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full mb-2">
                {item.time_horizon.charAt(0).toUpperCase() + item.time_horizon.slice(1)} term
              </span>
            )}
            {item.why && (
              <div className="bg-slate-50 p-3 rounded mt-2">
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Why:</span> {item.why}
                </p>
              </div>
            )}
          </>
        );

      case "Projects":
        return (
          <>
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.project_name}</h4>
            {item.goal && (
              <p className="text-slate-700 mb-2">
                <span className="font-medium">Goal:</span> {item.goal}
              </p>
            )}
            {item.description && <p className="text-slate-600 mb-2">{item.description}</p>}
            {item.status && (
              <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                item.status === 'active' ? 'bg-green-100 text-green-800' :
                item.status === 'paused' ? 'bg-amber-100 text-amber-800' :
                'bg-slate-100 text-slate-800'
              }`}>
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              </span>
            )}
          </>
        );

      case "Key People":
        return (
          <>
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.name}</h4>
            {item.relation && (
              <p className="text-slate-700 mb-2">
                <span className="font-medium">Relation:</span> {item.relation}
              </p>
            )}
            <div className="flex gap-4 text-sm text-slate-600 mb-2">
              {item.email && (
                <span>📧 {item.email}</span>
              )}
              {item.phone && (
                <span>📱 {item.phone}</span>
              )}
            </div>
            {item.context && (
              <p className="text-sm text-slate-600 mt-2">{item.context}</p>
            )}
          </>
        );

      case "Failures & Scars":
        return (
          <>
            <p className="text-slate-800 font-medium mb-3">{item.failure_text}</p>
            {item.learning && (
              <div className="bg-green-50 p-3 rounded mb-2">
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Learning:</span> {item.learning}
                </p>
              </div>
            )}
            {item.scar && (
              <div className="bg-red-50 p-3 rounded">
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Scar:</span> {item.scar}
                </p>
              </div>
            )}
          </>
        );

      case "Development Opportunities":
        return (
          <>
            <p className="text-slate-800 font-medium mb-2">{item.skill}</p>
            {item.source && (
              <p className="text-sm text-slate-600">
                <span className="font-medium">Source:</span> {item.source}
              </p>
            )}
          </>
        );

      default:
        return <p className="text-slate-600">No data available</p>;
    }
  };

  if (isEditing) {
    return (
      <div className="bg-white border-2 border-gray-200 rounded-lg p-4 space-y-3">
        {renderEditForm()}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSubmit}
            className="flex-1 bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded text-sm font-medium"
          >
            Save
          </button>
          <button
            onClick={onCancelEdit}
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
      {renderContent()}
      {item.first_seen_at && (
        <p className="text-xs text-slate-400 mt-3">
          Added {new Date(item.first_seen_at).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}