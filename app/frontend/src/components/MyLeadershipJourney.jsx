import React, { useState, useEffect } from "react";
import axios from "axios";

const CENTER = { x: 600, y: 600 };
const R_CENTER = 150;
const R_MIDDLE = 300;
const R_OUTER = 480;

// New Alfred Leadership Model dimensions
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

// Map topics to backend endpoints
const TOPIC_ENDPOINTS = {
  "Values": "values",
  "Strengths": "strengths",
  "Goals": "goals",
  "Team Composition": "team-composition",
  "Inspire": "inspiration",
  "Coach & Delegate": "coaching-moments",
  "Prioritization": "execution-systems", // Will filter by category
  "Execution System": "execution-systems",
  "Procrastination": "procrastination-patterns",
  "Energy Sources": "energy-sources",
  "Energy Drains": "energy-drains",
  "Recovery": "recovery-methods",
  "Failures & Scars": "failures",
  "Development Opportunities": "development-areas",
  "Development Plan": "execution-systems", // Will filter by category='development'
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

  const anglePerDim = 360 / DIMENSIONS.length;

  const handleTopicClick = async (topic) => {
    const endpoint = TOPIC_ENDPOINTS[topic];
    
    if (!endpoint) {
      console.log("No database endpoint for topic:", topic);
      return;
    }

    // If clicking the same topic, deselect it
    if (selectedTopic === topic) {
      setSelectedTopic(null);
      setTopicData([]);
      setEditing({ type: null, id: null });
      return;
    }

    setSelectedTopic(topic);
    setEditing({ type: null, id: null }); // Clear editing state when switching topics
    setLoading(true);

    try {
      const response = await axios.get(`${apiUrl}/api/journey/${endpoint}`, {
        params: { user_number: userNumber }
      });
      
      let data = response.data?.data || response.data || [];
      
      // Filter by category for specific topics
      if (topic === "Prioritization" && Array.isArray(data)) {
        data = data.filter(item => item.category === "prioritization");
      } else if (topic === "Development Plan" && Array.isArray(data)) {
        data = data.filter(item => item.category === "development");
      }
      
      setTopicData(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(`Error fetching ${topic}:`, err);
      setTopicData([]);
    } finally {
      setLoading(false);
    }
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
      setEditing({ type: null, id: null }); // Close editing after save
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
      setEditing({ type: null, id: null }); // Close editing after delete
    } catch (err) {
      console.error(`Error deleting ${selectedTopic}:`, err);
      alert(`Failed to delete ${selectedTopic}`);
    }
  };

  return (
    <div className="px-2 md:px-6 lg:px-10 py-2 md:py-4">
      {/* Page title */}
      <h1 className="text-xl md:text-2xl lg:text-3xl font-semibold text-slate-800 mb-1">
        Alfred Leadership Model
      </h1>
      <p className="text-xs md:text-sm lg:text-base text-slate-600 mb-2 md:mb-4">
        A comprehensive framework for executive development
      </p>

      {/* Main Layout: Wheel + Content Side-by-Side */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        
        {/* LEFT SIDE: Wheel + Hover Text */}
        <div className="flex-shrink-0 lg:w-[500px]">
          {/* SVG Wheel */}
          <div className="flex justify-center items-start mb-4">
            <svg 
              viewBox="0 0 1200 1200" 
              className="w-full max-w-[280px] md:max-w-[400px] lg:max-w-[500px] h-auto"
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
                  const isSelected = selectedTopic === topic;

                  return (
                    <g key={topic}>
                      {/* Topic wedge */}
                      <path
                        d={wedgePath(R_MIDDLE, R_OUTER, tStart, tEnd)}
                        fill={isSelected ? "#CBD5E1" : "#E5E7EB"}
                        stroke="#CBD5E1"
                        strokeWidth="1"
                        className="cursor-pointer hover:fill-slate-300 transition-colors"
                        onClick={() => handleTopicClick(topic)}
                        onMouseEnter={() => setHoveredTopic(topic)}
                        onMouseLeave={() => setHoveredTopic(null)}
                      />
                      
                      {/* Topic label - split long text into two lines */}
                      <text
                        x={topicLabelPos.x}
                        y={topicLabelPos.y}
                        textAnchor="middle"
                        fontSize="14"
                        fill="#1e293b"
                        fontWeight="500"
                        className="pointer-events-none"
                      >
                        {topic.includes(' & ') ? (
                          <>
                            <tspan x={topicLabelPos.x} dy="-8">{topic.split(' & ')[0]}</tspan>
                            <tspan x={topicLabelPos.x} dy="16">& {topic.split(' & ')[1]}</tspan>
                          </>
                        ) : topic.length > 12 ? (
                          <>
                            <tspan x={topicLabelPos.x} dy="-8">{topic.split(' ')[0]}</tspan>
                            <tspan x={topicLabelPos.x} dy="16">{topic.split(' ').slice(1).join(' ')}</tspan>
                          </>
                        ) : (
                          topic
                        )}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover Tooltip - "Why it matters" - Below wheel on left side */}
      <div className="min-h-[120px] md:min-h-[140px]">
        {hoveredTopic ? (
          <div className="bg-blue-50 border-l-4 border-blue-500 p-3 md:p-4 rounded-r">
            <h3 className="text-sm md:text-base lg:text-lg font-semibold text-blue-900 mb-2">
              Why {hoveredTopic} Matters
            </h3>
            <p className="text-xs md:text-sm lg:text-base text-blue-800 leading-relaxed">
              {WHY_IT_MATTERS[hoveredTopic]}
            </p>
          </div>
        ) : (
          <div className="text-center text-slate-400 text-xs md:text-sm p-4">
            Hover over any topic to learn why it matters
          </div>
        )}
      </div>
    </div>

    {/* RIGHT SIDE: Selected Topic Data */}
    <div className="flex-1 min-h-[500px]">
      {selectedTopic && (
        <div className="bg-white border-2 border-slate-300 rounded-lg shadow-lg p-3 md:p-4 lg:p-6 h-full">
          {/* Header */}
          <div className="flex justify-between items-start mb-4 pb-3 md:pb-4 border-b">
            <div className="flex-1">
              <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-slate-800 mb-2">
                {selectedTopic}
              </h2>
              <p className="text-xs md:text-sm lg:text-base text-slate-600 leading-relaxed">
                {WHY_IT_MATTERS[selectedTopic]}
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedTopic(null);
                setTopicData([]);
                setEditing({ type: null, id: null });
              }}
              className="ml-4 text-slate-400 hover:text-slate-600 text-2xl md:text-3xl leading-none flex-shrink-0"
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
              <p className="text-sm md:text-base text-slate-600">
                No {selectedTopic.toLowerCase()} captured yet. Share with Alfred to see them here!
              </p>
            </div>
          ) : (
            <div className="space-y-3 md:space-y-4 overflow-y-auto max-h-[calc(100vh-300px)]">
              {topicData.map((item) => (
                <DataCardInlineEdit
                  key={item.id}
                  item={item}
                  topic={selectedTopic}
                  isEditing={editing.id === item.id}
                  onStartEdit={() => setEditing({ type: selectedTopic, id: item.id })}
                  onCancelEdit={() => setEditing({ type: null, id: null })}
                  onSave={(updates) => updateItem(item.id, updates)}
                  onDelete={() => deleteItem(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  </div>
    </div>
  );
}

// Inline-edit card - click to edit automatically
function DataCardInlineEdit({ item, topic, isEditing, onStartEdit, onCancelEdit, onSave, onDelete }) {
  const [formData, setFormData] = useState(item);

  // Auto-open edit mode when card is clicked
  const handleCardClick = () => {
    if (!isEditing) {
      onStartEdit();
    }
  };

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
              onChange={(e) => setFormData({ ...formData, approach: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Approach (storytelling, vision-setting, etc.)"
              rows={2}
            />
            <input
              type="text"
              value={formData.effectiveness || ''}
              onChange={(e) => setFormData({ ...formData, effectiveness: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
              placeholder="What works well (optional)"
            />
          </>
        );

      case "Coach & Delegate":
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
              value={formData.moment_text || ''}
              onChange={(e) => setFormData({ ...formData, moment_text: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Coaching or delegation moment"
              rows={2}
            />
            <input
              type="text"
              value={formData.person || ''}
              onChange={(e) => setFormData({ ...formData, person: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Person (optional)"
            />
            <textarea
              value={formData.outcome || ''}
              onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500 mb-2"
              placeholder="Outcome (optional)"
              rows={2}
            />
            <textarea
              value={formData.learning || ''}
              onChange={(e) => setFormData({ ...formData, learning: e.target.value })}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-gray-500"
              placeholder="Learning (optional)"
              rows={2}
            />
          </>
        );

      case "Failures & Scars":
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
      case "Values":
        return (
          <>
            {item.title && (
              <h4 className="text-lg md:text-xl font-bold text-slate-800 mb-3">{item.title}</h4>
            )}
            <p className="text-base md:text-lg text-slate-800 font-medium mb-3 leading-relaxed whitespace-pre-wrap break-words">
              {item.value_text}
            </p>
            {item.why && (
              <div className="bg-slate-50 p-3 md:p-4 rounded mt-3">
                <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                  <span className="font-medium">Why it matters:</span> {item.why}
                </p>
              </div>
            )}
          </>
        );

      case "Strengths":
        return (
          <>
            {item.title && (
              <h4 className="text-lg md:text-xl font-bold text-slate-800 mb-3">{item.title}</h4>
            )}
            <p className="text-base md:text-lg text-slate-800 font-medium mb-3 leading-relaxed whitespace-pre-wrap break-words">
              {item.strength}
            </p>
            {item.source && (
              <p className="text-sm md:text-base text-slate-600">
                <span className="font-medium">Source:</span> {item.source}
              </p>
            )}
          </>
        );

      case "Goals":
        return (
          <>
            {item.title && (
              <h4 className="text-lg md:text-xl font-bold text-slate-800 mb-3">{item.title}</h4>
            )}
            <p className="text-base md:text-lg text-slate-800 font-medium mb-3 leading-relaxed whitespace-pre-wrap break-words">
              {item.goal_text}
            </p>
            {item.time_horizon && (
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs md:text-sm font-medium rounded-full mb-3">
                {item.time_horizon.charAt(0).toUpperCase() + item.time_horizon.slice(1)} term
              </span>
            )}
            {item.why && (
              <div className="bg-slate-50 p-3 md:p-4 rounded mt-3">
                <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                  <span className="font-medium">Why:</span> {item.why}
                </p>
              </div>
            )}
          </>
        );

      case "Energy Sources":
        return (
          <>
            {item.title && (
              <h4 className="text-lg md:text-xl font-bold text-slate-800 mb-3">{item.title}</h4>
            )}
            <p className="text-base md:text-lg text-slate-800 font-medium mb-3 leading-relaxed whitespace-pre-wrap break-words">
              {item.source_text}
            </p>
            {item.category && (
              <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-xs md:text-sm font-medium rounded-full">
                {item.category}
              </span>
            )}
          </>
        );

      case "Energy Drains":
        return (
          <>
            {item.title && (
              <h4 className="text-lg md:text-xl font-bold text-slate-800 mb-3">{item.title}</h4>
            )}
            <p className="text-base md:text-lg text-slate-800 font-medium mb-3 leading-relaxed whitespace-pre-wrap break-words">
              {item.drain_text}
            </p>
            {item.category && (
              <span className="inline-block px-3 py-1 bg-red-100 text-red-800 text-xs md:text-sm font-medium rounded-full mb-3">
                {item.category}
              </span>
            )}
            {item.mitigation && (
              <div className="bg-blue-50 p-3 md:p-4 rounded mt-3">
                <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                  <span className="font-medium">Mitigation:</span> {item.mitigation}
                </p>
              </div>
            )}
          </>
        );

      case "Recovery":
        return (
          <>
            {item.title && (
              <h4 className="text-lg md:text-xl font-bold text-slate-800 mb-3">{item.title}</h4>
            )}
            <p className="text-base md:text-lg text-slate-800 font-medium mb-3 leading-relaxed whitespace-pre-wrap break-words">
              {item.method_text}
            </p>
            <div className="flex gap-2 flex-wrap">
              {item.category && (
                <span className="inline-block px-3 py-1 bg-purple-100 text-purple-800 text-xs md:text-sm font-medium rounded-full">
                  {item.category}
                </span>
              )}
              {item.frequency && (
                <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-800 text-xs md:text-sm font-medium rounded-full">
                  {item.frequency}
                </span>
              )}
            </div>
          </>
        );

      case "Procrastination":
        return (
          <>
            {item.title && (
              <h4 className="text-lg md:text-xl font-bold text-slate-800 mb-3">{item.title}</h4>
            )}
            <p className="text-base md:text-lg text-slate-800 font-medium mb-3 leading-relaxed whitespace-pre-wrap break-words">
              {item.pattern_text}
            </p>
            {item.underlying_reason && (
              <div className="bg-amber-50 p-3 md:p-4 rounded mb-3">
                <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                  <span className="font-medium">Why:</span> {item.underlying_reason}
                </p>
              </div>
            )}
            {item.strategy && (
              <div className="bg-green-50 p-3 md:p-4 rounded">
                <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                  <span className="font-medium">Strategy:</span> {item.strategy}
                </p>
              </div>
            )}
          </>
        );

      case "Execution System":
      case "Prioritization":
      case "Development Plan":
        return (
          <>
            {item.title && (
              <h4 className="text-lg md:text-xl font-bold text-slate-800 mb-3">{item.title}</h4>
            )}
            <p className="text-base md:text-lg text-slate-800 font-medium mb-3 leading-relaxed whitespace-pre-wrap break-words">
              {item.system_text}
            </p>
            <div className="flex gap-2 flex-wrap">
              {item.category && (
                <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs md:text-sm font-medium rounded-full">
                  {item.category}
                </span>
              )}
              {item.effectiveness && (
                <span className="inline-block px-3 py-1 bg-slate-100 text-slate-800 text-xs md:text-sm font-medium rounded-full">
                  {item.effectiveness}
                </span>
              )}
            </div>
          </>
        );

      case "Team Composition":
        return (
          <>
            {item.title && (
              <h4 className="text-lg md:text-xl font-bold text-slate-800 mb-3">{item.title}</h4>
            )}
            <p className="text-base md:text-lg text-slate-800 font-medium mb-3 leading-relaxed whitespace-pre-wrap break-words">
              {item.composition_text}
            </p>
            {item.team_type && (
              <span className="inline-block px-3 py-1 bg-purple-100 text-purple-800 text-xs md:text-sm font-medium rounded-full mb-3">
                {item.team_type}
              </span>
            )}
            {item.dynamics && (
              <div className="bg-slate-50 p-3 md:p-4 rounded mt-3">
                <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                  <span className="font-medium">Dynamics:</span> {item.dynamics}
                </p>
              </div>
            )}
          </>
        );

      case "Inspire":
        return (
          <>
            {item.title && (
              <h4 className="text-lg md:text-xl font-bold text-slate-800 mb-3">{item.title}</h4>
            )}
            <p className="text-base md:text-lg text-slate-800 font-medium mb-3 leading-relaxed whitespace-pre-wrap break-words">
              {item.inspiration_text}
            </p>
            {item.approach && (
              <div className="bg-blue-50 p-3 md:p-4 rounded mb-3">
                <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                  <span className="font-medium">Approach:</span> {item.approach}
                </p>
              </div>
            )}
            {item.effectiveness && (
              <div className="bg-green-50 p-3 md:p-4 rounded">
                <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                  <span className="font-medium">What works:</span> {item.effectiveness}
                </p>
              </div>
            )}
          </>
        );

      case "Coach & Delegate":
        return (
          <>
            {item.title && (
              <h4 className="text-lg md:text-xl font-bold text-slate-800 mb-3">{item.title}</h4>
            )}
            <p className="text-base md:text-lg text-slate-800 font-medium mb-3 leading-relaxed whitespace-pre-wrap break-words">
              {item.moment_text}
            </p>
            {item.person && (
              <p className="text-sm md:text-base text-slate-600 mb-3">
                <span className="font-medium">Person:</span> {item.person}
              </p>
            )}
            {item.outcome && (
              <div className="bg-blue-50 p-3 md:p-4 rounded mb-3">
                <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                  <span className="font-medium">Outcome:</span> {item.outcome}
                </p>
              </div>
            )}
            {item.learning && (
              <div className="bg-green-50 p-3 md:p-4 rounded">
                <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                  <span className="font-medium">Learning:</span> {item.learning}
                </p>
              </div>
            )}
          </>
        );

      case "Failures & Scars":
        return (
          <>
            {item.title && (
              <h4 className="text-lg md:text-xl font-bold text-slate-800 mb-3">{item.title}</h4>
            )}
            <p className="text-base md:text-lg text-slate-800 font-medium mb-4 leading-relaxed whitespace-pre-wrap break-words">
              {item.failure_text}
            </p>
            {item.learning && (
              <div className="bg-green-50 p-3 md:p-4 rounded mb-3">
                <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                  <span className="font-medium">Learning:</span> {item.learning}
                </p>
              </div>
            )}
            {item.scar && (
              <div className="bg-red-50 p-3 md:p-4 rounded">
                <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                  <span className="font-medium">Scar:</span> {item.scar}
                </p>
              </div>
            )}
          </>
        );

      case "Development Opportunities":
        return (
          <>
            {item.title && (
              <h4 className="text-lg md:text-xl font-bold text-slate-800 mb-3">{item.title}</h4>
            )}
            <p className="text-base md:text-lg text-slate-800 font-medium mb-3 leading-relaxed whitespace-pre-wrap break-words">
              {item.skill}
            </p>
            {item.source && (
              <p className="text-sm md:text-base text-slate-600">
                <span className="font-medium">Source:</span> {item.source}
              </p>
            )}
          </>
        );

      default:
        return <p className="text-base md:text-lg text-slate-600">No data available</p>;
    }
  };

  if (isEditing) {
    return (
      <div className="bg-white border-2 border-blue-300 rounded-lg p-3 md:p-4 space-y-3 shadow-lg">
        {renderEditForm()}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSubmit}
            className="flex-1 bg-slate-700 hover:bg-slate-800 text-white px-3 md:px-4 py-2 rounded text-sm md:text-base font-medium"
          >
            Save
          </button>
          <button
            onClick={onCancelEdit}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 md:px-4 py-2 rounded text-sm md:text-base font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            className="px-3 md:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm md:text-base font-medium"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="bg-white border border-gray-200 rounded-lg p-3 md:p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer"
      onClick={handleCardClick}
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