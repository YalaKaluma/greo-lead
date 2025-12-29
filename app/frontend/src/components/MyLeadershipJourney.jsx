import React, { useState, useEffect } from "react";
import axios from "axios";

const CENTER = { x: 600, y: 600 };
const R_CENTER = 150;
const R_MIDDLE = 300;
const R_OUTER = 480;

const DIMENSIONS = [
  {
    name: "Vision & Goals",
    topics: ["Values", "Strengths", "Goals"],
  },
  {
    name: "People",
    topics: ["Team Composition", "Inspire", "Coach & Delegate"],
  },
  {
    name: "Prioritize & Execute",
    topics: ["Prioritization", "Execution System", "Procrastination"],
  },
  {
    name: "Time & Energy",
    topics: ["Energy Sources", "Energy Drains", "Recovery"],
  },
  {
    name: "Learning & Development",
    topics: [
      "Failures & Scars",
      "Development Opportunities",
      "Development Plan",
    ],
  },
];

// Map topics to database endpoints
const TOPIC_ENDPOINTS = {
  "Values": "values",
  "Strengths": "strengths",
  "Goals": "goals",
  "Team Composition": "team-composition",
  "Inspire": "inspiration",
  "Coach & Delegate": "coaching-moments",
  "Prioritization": "execution-systems",
  "Execution System": "execution-systems",
  "Procrastination": "procrastination-patterns",
  "Energy Sources": "energy-sources",
  "Energy Drains": "energy-drains",
  "Recovery": "recovery-methods",
  "Failures & Scars": "failures",
  "Development Opportunities": "development-areas",
  "Development Plan": "execution-systems",
};

// "Why it matters" explanations
const WHY_IT_MATTERS = {
  Values:
    "Values are the rules you follow when no one is watching. They reduce inner conflict and make trade-offs easier to live with.",
  Strengths:
    "Leadership impact compounds when you deliberately use what already works instead of trying to fix everything.",
  Goals:
    "Clear goals give direction and permission. They reduce noise and help you decide what deserves attention now.",
  "Team Composition":
    "The people around you shape your behavior more than your intentions. Structure often beats effort.",
  Inspire:
    "Inspiration creates energy and alignment. Without it, leaders end up pushing instead of pulling.",
  "Coach & Delegate":
    "Coaching and delegation turn effort into leverage and protect your focus.",
  Prioritization:
    "Every yes quietly creates a no. Prioritization is the ability to say no without guilt.",
  "Execution System":
    "Willpower doesn't scale. A clear execution system creates progress without mental overload.",
  Procrastination:
    "Procrastination is usually a signal of resistance, fear, or misalignment — not laziness.",
  "Energy Sources":
    "Energy determines the quality of your decisions. Knowing what fuels you protects clarity.",
  "Energy Drains":
    "Some activities cost more than they appear. Identifying them allows redesign or containment.",
  Recovery:
    "Recovery is not a reward. It is a prerequisite for sustained leadership.",
  "Failures & Scars":
    "Unexamined experiences tend to repeat. Reflection turns experience into information.",
  "Development Opportunities":
    "Growth often hides inside discomfort. Naming it creates direction.",
  "Development Plan":
    "Insight only compounds when it leads to deliberate action.",
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
  const [hoveredTopic, setHoveredTopic] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

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
      setSelectedItem(null); // Close modal
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
      setSelectedItem(null); // Close modal
    } catch (err) {
      console.error(`Error deleting ${selectedTopic}:`, err);
      alert(`Failed to delete ${selectedTopic}`);
    }
  };

  return (
    <div className="px-2 md:px-10 py-4 md:py-8">
      {/* Page title */}
      <h1 className="text-2xl md:text-3xl font-semibold text-slate-800 mb-1 md:mb-2">
        Alfred Leadership Model
      </h1>
      <p className="text-sm md:text-base text-slate-600 mb-4 md:mb-6">Understanding your journey to shape your future</p>

      {/* Dynamic Layout: Center initially, Left-Right when topic selected */}
      <div className={`flex flex-col gap-6 transition-all duration-700 ease-in-out ${
        selectedTopic ? 'lg:flex-row lg:gap-8' : 'items-center justify-center min-h-[70vh]'
      }`}>
        
        {/* Wheel Container - Large center, then shrinks left */}
        <div className={`transition-all duration-700 ease-in-out ${
          selectedTopic 
            ? 'lg:w-[400px] flex-shrink-0' 
            : 'w-full max-w-[900px]'
        }`}>
          <div className="flex justify-center items-start">
            <svg 
              viewBox="0 0 1200 1200" 
              className={`w-full h-auto transition-all duration-700 ease-in-out ${
                selectedTopic 
                  ? 'max-w-[280px] md:max-w-[350px] lg:max-w-[400px]' 
                  : 'max-w-[350px] md:max-w-[550px] lg:max-w-[900px]'
              }`}
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
                        onMouseEnter={() => setHoveredTopic(topic)}
                        onMouseLeave={() => setHoveredTopic(null)}
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

      {/* Hover tooltip - only when no topic selected */}
      {!selectedTopic && hoveredTopic && (
        <div className="max-w-[700px] mx-auto mt-6 bg-blue-50 border-l-4 border-blue-500 p-4 md:p-6 rounded-r">
          <h3 className="text-base md:text-lg font-semibold text-blue-900 mb-2">
            Why {hoveredTopic} Matters
          </h3>
          <p className="text-sm md:text-base text-blue-800 leading-relaxed">
            {WHY_IT_MATTERS[hoveredTopic]}
          </p>
        </div>
      )}
    </div>

    {/* RIGHT SIDE: Content panel - appears when topic selected */}
    {selectedTopic && (
      <div className="flex-1">
        <div className="bg-white border-2 border-slate-300 rounded-lg shadow-lg p-4 md:p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-4 pb-4 border-b">
            <div className="flex-1">
              <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-2">
                {selectedTopic}
              </h2>
              <p className="text-sm md:text-base text-slate-600 leading-relaxed">
                {WHY_IT_MATTERS[selectedTopic]}
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedTopic(null);
                setTopicData([]);
                setSelectedItem(null);
              }}
              className="ml-4 text-slate-400 hover:text-slate-600 text-3xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : topicData.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-600">
                No {selectedTopic.toLowerCase()} captured yet. Share with Alfred to see them here!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[calc(100vh-350px)] overflow-y-auto pr-2">
              {topicData.map((item) => (
                <SimpleDataCard
                  key={item.id}
                  item={item}
                  topic={selectedTopic}
                  onClick={() => setSelectedItem(item)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )}
  </div>

  {/* Item Detail Modal */}
  {selectedItem && (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={() => {
        setSelectedItem(null);
        setEditing({ type: null, id: null });
      }}
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 md:p-6 flex justify-between items-center z-10">
          <h3 className="text-lg md:text-xl font-bold text-slate-800">
            {selectedTopic}
          </h3>
          <button
            onClick={() => {
              setSelectedItem(null);
              setEditing({ type: null, id: null });
            }}
            className="text-slate-400 hover:text-slate-600 text-2xl md:text-3xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 md:p-6">
          <ItemDetailWithEdit
            item={selectedItem}
            topic={selectedTopic}
            isEditing={editing.id === selectedItem.id}
            onEdit={() => setEditing({ type: selectedTopic, id: selectedItem.id })}
            onCancelEdit={() => setEditing({ type: null, id: null })}
            onSave={(updates) => updateItem(selectedItem.id, updates)}
            onDelete={() => deleteItem(selectedItem.id)}
          />
        </div>
      </div>
    </div>
  )}
</div>
  );
}

// Simple preview card for grid
function SimpleDataCard({ item, topic, onClick }) {
  const getPreviewText = () => {
    switch (topic) {
      case "Values": return item.value_text;
      case "Strengths": return item.strength;
      case "Goals": return item.goal_text;
      case "Energy Sources": return item.source_text;
      case "Energy Drains": return item.drain_text;
      case "Recovery": return item.method_text;
      case "Procrastination": return item.pattern_text;
      case "Execution System":
      case "Prioritization":
      case "Development Plan": return item.system_text;
      case "Team Composition": return item.composition_text;
      case "Inspire": return item.inspiration_text;
      case "Coach & Delegate": return item.moment_text;
      case "Failures & Scars": return item.failure_text;
      case "Development Opportunities": return item.skill;
      default: return "No preview available";
    }
  };

  const truncate = (text, maxLength = 120) => {
    if (!text) return "";
    return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
  };

  return (
    <div 
      className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer"
      onClick={onClick}
    >
      {item.title && (
        <h4 className="text-base font-bold text-slate-800 mb-2">{item.title}</h4>
      )}
      <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
        {truncate(getPreviewText())}
      </p>
      {item.first_seen_at && (
        <p className="text-xs text-slate-400 mt-3">
          {new Date(item.first_seen_at).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

// Item detail component with edit capability
function ItemDetailWithEdit({ item, topic, isEditing, onEdit, onCancelEdit, onSave, onDelete }) {
  const [formData, setFormData] = useState(item);

  const handleSubmit = () => {
    onSave(formData);
  };

  const renderEditForm = () => {
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