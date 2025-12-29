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

const WHY_IT_MATTERS = {
  "Values": "Values are the rules you follow when no one is watching. They reduce inner conflict and make trade-offs easier.",
  "Strengths": "Leadership impact compounds when you deliberately use what already works instead of trying to fix everything.",
  "Goals": "Clear goals give direction and permission. They reduce noise and help you decide what deserves attention now.",
  "Team Composition": "The people around you shape your behavior more than your intentions. Structure often beats effort.",
  "Inspire": "Inspiration creates energy and alignment. Without it, leaders end up pushing instead of pulling.",
  "Coach & Delegate": "Coaching and delegation turn effort into leverage and protect your focus.",
  "Prioritization": "Every yes quietly creates a no. Prioritization is the ability to say no without guilt.",
  "Execution System": "Willpower doesn't scale. A clear execution system creates progress without mental overload.",
  "Procrastination": "Procrastination is usually a signal of resistance, fear, or misalignment — not laziness.",
  "Energy Sources": "Energy determines the quality of your decisions. Knowing what fuels you protects clarity.",
  "Energy Drains": "Some activities cost more than they appear. Identifying them allows redesign or containment.",
  "Recovery": "Recovery is not a reward. It is a prerequisite for sustained leadership.",
  "Failures & Scars": "Unexamined experiences tend to repeat. Reflection turns experience into information.",
  "Development Opportunities": "Growth often hides inside discomfort. Naming it creates direction.",
  "Development Plan": "Insight only compounds when it leads to deliberate action.",
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
        Alfred Leadership Model
      </h1>
      <p className="text-sm md:text-base text-slate-600 mb-4 md:mb-6">Understanding your journey to shape your future</p>

      {/* Main layout with transitions */}
      <div className={`flex flex-col gap-6 transition-all duration-700 ease-in-out ${
        selectedTopic ? 'lg:flex-row lg:gap-8' : 'items-center justify-center min-h-[60vh]'
      }`}>
        
        {/* Wheel container */}
        <div className={`transition-all duration-700 ease-in-out ${
          selectedTopic ? 'lg:w-[420px] flex-shrink-0' : 'w-full max-w-[900px]'
        }`}>
          <div className="flex justify-center items-start">
            <svg 
              viewBox="0 0 1200 1200" 
              className={`w-full h-auto transition-all duration-700 ease-in-out ${
                selectedTopic 
                  ? 'max-w-[280px] md:max-w-[350px] lg:max-w-[420px]' 
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

      {/* Hover tooltip below wheel */}
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

    {/* Content panel on right */}
    {selectedTopic && (
      <div className="flex-1">
        <div className="bg-white border border-slate-300 rounded-lg shadow-lg p-4 md:p-6">
          <div className="flex justify-between items-start mb-4 pb-4 border-b">
            <h2 className="text-xl md:text-2xl font-semibold text-slate-800">{selectedTopic}</h2>
            <button
              onClick={closeModal}
              className="text-slate-400 hover:text-slate-600 text-2xl md:text-3xl"
            >
              ×
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : topicData.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              No {selectedTopic.toLowerCase()} captured yet.
            </div>
          ) : (
            <div className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto pr-2">
              {topicData.map((item, index) => (
                <TopicCard 
                  key={item.id || index} 
                  topic={selectedTopic} 
                  item={item}
                  isEditing={editing.type === selectedTopic && editing.id === item.id}
                  onEdit={() => setEditing({ type: selectedTopic, id: item.id })}
      </div>

      {/* "Why it matters" Modal */}
      {showWhyModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={closeWhyModal}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-slate-800">
                Why {showWhyModal} Matters
              </h3>
              <button
                onClick={closeWhyModal}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-slate-700 leading-relaxed">
              {WHY_IT_MATTERS[showWhyModal]}
            </p>
          </div>
        </div>
      )}

      {/* Data Modal */}
      {selectedTopic && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={closeModal}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">{selectedTopic}</h2>
                <p className="text-sm text-slate-600 mt-1">
                  {WHY_IT_MATTERS[selectedTopic]}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 text-3xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
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
                <div className="space-y-4">
                  {topicData.map((item) => (
                    <DataCard
                      key={item.id}
                      item={item}
                      topic={selectedTopic}
                      isEditing={editing.id === item.id}
                      onEdit={() => setEditing({ type: selectedTopic, id: item.id })}
                      onCancelEdit={() => setEditing({ type: null, id: null })}
                      onSave={(updates) => updateItem(item.id, updates)}
                      onDelete={() => deleteItem(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable DataCard component for displaying and editing items
function DataCard({ item, topic, isEditing, onEdit, onCancelEdit, onSave, onDelete }) {
  const [formData, setFormData] = useState(item);

  const handleSubmit = () => {
    onSave(formData);
  };

  const renderEditForm = () => {
    switch (topic) {
      case "Values":
        return (
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
              value={formData.time_horizon || 'medium'}
              onChange={(e) => setFormData({ ...formData, time_horizon: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
            >
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

      case "Energy Sources":
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
              value={formData.source_text || ''}
              onChange={(e) => setFormData({ ...formData, source_text: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="What gives you energy"
              rows={2}
            />
            <input
              type="text"
              value={formData.category || ''}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
              placeholder="Category (e.g., physical, mental, social)"
            />
          </>
        );

      case "Energy Drains":
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
              value={formData.drain_text || ''}
              onChange={(e) => setFormData({ ...formData, drain_text: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="What drains your energy"
              rows={2}
            />
            <input
              type="text"
              value={formData.category || ''}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Category (optional)"
            />
            <textarea
              value={formData.mitigation || ''}
              onChange={(e) => setFormData({ ...formData, mitigation: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
              placeholder="How to reduce impact (optional)"
              rows={2}
            />
          </>
        );

      case "Recovery":
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
              value={formData.method_text || ''}
              onChange={(e) => setFormData({ ...formData, method_text: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="How you recover"
              rows={2}
            />
            <input
              type="text"
              value={formData.category || ''}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Category (e.g., exercise, rest, nature)"
            />
            <input
              type="text"
              value={formData.frequency || ''}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
              placeholder="Frequency (e.g., daily, weekly)"
            />
          </>
        );

      case "Procrastination":
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
              value={formData.pattern_text || ''}
              onChange={(e) => setFormData({ ...formData, pattern_text: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="What you procrastinate on"
              rows={2}
            />
            <textarea
              value={formData.underlying_reason || ''}
              onChange={(e) => setFormData({ ...formData, underlying_reason: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Why (fear, overwhelm, unclear, etc.)"
              rows={2}
            />
            <textarea
              value={formData.strategy || ''}
              onChange={(e) => setFormData({ ...formData, strategy: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
              placeholder="Strategy to overcome (optional)"
              rows={2}
            />
          </>
        );

      case "Execution System":
      case "Prioritization":
      case "Development Plan":
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
              value={formData.system_text || ''}
              onChange={(e) => setFormData({ ...formData, system_text: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="System description"
              rows={2}
            />
            <input
              type="text"
              value={formData.category || ''}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Category"
            />
            <input
              type="text"
              value={formData.effectiveness || ''}
              onChange={(e) => setFormData({ ...formData, effectiveness: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
              placeholder="Effectiveness (working well, needs improvement, etc.)"
            />
          </>
        );

      case "Team Composition":
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
              value={formData.composition_text || ''}
              onChange={(e) => setFormData({ ...formData, composition_text: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Team structure"
              rows={2}
            />
            <input
              type="text"
              value={formData.team_type || ''}
              onChange={(e) => setFormData({ ...formData, team_type: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Team type (direct reports, cross-functional, etc.)"
            />
            <textarea
              value={formData.dynamics || ''}
              onChange={(e) => setFormData({ ...formData, dynamics: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
              placeholder="Team dynamics (optional)"
              rows={2}
            />
          </>
        );

      case "Inspire":
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
              value={formData.inspiration_text || ''}
              onChange={(e) => setFormData({ ...formData, inspiration_text: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="How you inspire"
              rows={2}
            />
            <textarea
              value={formData.approach || ''}