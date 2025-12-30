import React, { useState, useEffect } from "react";
import axios from "axios";

const CENTER = { x: 500, y: 500 };
const R_CENTER = 120;
const R_MIDDLE = 240;
const R_OUTER = 360;

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
  const [editingItem, setEditingItem] = useState(null);
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

  const handleItemClick = (item) => {
    setEditingItem(item);
  };

  const closeContentView = () => {
    setSelectedTopic(null);
    setTopicData([]);
    setEditingItem(null);
  };

  const closeEditModal = () => {
    setEditingItem(null);
  };

  const updateItem = async (id, updates) => {
    const endpoint = TOPIC_ENDPOINTS[selectedTopic];
    
    try {
      if (id) {
        // Update existing item
        await axios.put(
          `${apiUrl}/api/journey/${endpoint}/${id}`,
          updates,
          { params: { user_number: userNumber } }
        );
      } else {
        // Create new item
        await axios.post(
          `${apiUrl}/api/journey/${endpoint}`,
          { ...updates, user_number: userNumber },
          { params: { user_number: userNumber } }
        );
      }
      
      // Refresh data
      const response = await axios.get(`${apiUrl}/api/journey/${endpoint}`, {
        params: { user_number: userNumber }
      });
      const data = response.data?.data || response.data || [];
      setTopicData(Array.isArray(data) ? data : []);
      setEditingItem(null);
    } catch (err) {
      console.error(`Error ${id ? 'updating' : 'creating'} ${selectedTopic}:`, err);
      alert(`Failed to ${id ? 'update' : 'create'} ${selectedTopic}`);
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
      setEditingItem(null);
    } catch (err) {
      console.error(`Error deleting ${selectedTopic}:`, err);
      alert(`Failed to delete ${selectedTopic}`);
    }
  };

  return (
    <div className="px-2 md:px-10 py-4 md:py-6">
      {/* Page title */}
      <h1 className="text-2xl md:text-3xl font-semibold text-slate-800 mb-1">
        Alfred Leadership Model
      </h1>
      <p className="text-sm md:text-base text-slate-600 mb-3 md:mb-4">
        A comprehensive framework for executive development
      </p>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left side: "Why it matters" text (appears on hover) - only takes space when visible */}
        {hoveredTopic && WHY_IT_MATTERS[hoveredTopic] && (
          <div className="w-full lg:w-64 flex-shrink-0">
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
              <h3 className="font-semibold text-slate-800 mb-2">{hoveredTopic}</h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {WHY_IT_MATTERS[hoveredTopic]}
              </p>
            </div>
          </div>
        )}

        {/* Center: The wheel */}
        <div className={`flex-shrink-0 transition-all duration-300 mx-auto ${selectedTopic ? 'lg:w-[450px] lg:mx-0' : 'lg:w-full lg:max-w-4xl'}`}>
          <svg 
            viewBox="0 0 1000 1000" 
            className="w-full h-auto"
          >
            {/* Define all gradients at the top level */}
            <defs>
              {/* Center gradient - dark navy blue */}
              <linearGradient id="center-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1e3a5f" />
                <stop offset="100%" stopColor="#2d4a6f" />
              </linearGradient>
              
              {/* Dimension gradients - soft blues for middle ring */}
              <linearGradient id="gradient-0" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a8c5e6" />
                <stop offset="100%" stopColor="#8badce" />
              </linearGradient>
              <linearGradient id="gradient-1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#9cb8d9" />
                <stop offset="100%" stopColor="#7fa0c5" />
              </linearGradient>
              <linearGradient id="gradient-2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#b5ceea" />
                <stop offset="100%" stopColor="#95b5d8" />
              </linearGradient>
              <linearGradient id="gradient-3" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a8c5e6" />
                <stop offset="100%" stopColor="#8badce" />
              </linearGradient>
              <linearGradient id="gradient-4" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#9cb8d9" />
                <stop offset="100%" stopColor="#7fa0c5" />
              </linearGradient>
            </defs>

            {/* Center circle */}
            <circle
              cx={CENTER.x}
              cy={CENTER.y}
              r={R_CENTER}
              fill="url(#center-gradient)"
              stroke="white"
              strokeWidth="4"
            />
            <text
              x={CENTER.x}
              y={CENTER.y - 15}
              textAnchor="middle"
              fill="white"
              fontSize="28"
              fontWeight="bold"
            >
              Alfred
            </text>
            <text
              x={CENTER.x}
              y={CENTER.y + 10}
              textAnchor="middle"
              fill="white"
              fontSize="18"
            >
              Leadership
            </text>
            <text
              x={CENTER.x}
              y={CENTER.y + 32}
              textAnchor="middle"
              fill="white"
              fontSize="18"
            >
              Model
            </text>

            {/* Dimensions and Topics */}
            {DIMENSIONS.map((dim, dimIdx) => {
              const dimAngleStart = dimIdx * anglePerDim;
              const dimAngleEnd = (dimIdx + 1) * anglePerDim;
              const anglePerTopic = anglePerDim / dim.topics.length;

              const dimMidAngle = dimAngleStart + anglePerDim / 2;
              
              // Position dimension label in the MIDDLE ring (not outside)
              const labelPos = polar(CENTER.x, CENTER.y, (R_CENTER + R_MIDDLE) / 2, dimMidAngle);

              // Elegant soft blue gradients from the reference image
              const dimGradients = [
                { start: "#a8c5e6", end: "#8badce" },
                { start: "#9cb8d9", end: "#7fa0c5" },
                { start: "#b5ceea", end: "#95b5d8" },
                { start: "#a8c5e6", end: "#8badce" },
                { start: "#9cb8d9", end: "#7fa0c5" },
              ];
              const gradient = dimGradients[dimIdx % dimGradients.length];
              const gradientId = `gradient-${dimIdx}`;

              return (
                <g key={dimIdx}>
                  {/* Middle ring: Dimension label */}
                  <path
                    d={wedgePath(R_CENTER, R_MIDDLE, dimAngleStart, dimAngleEnd)}
                    fill={`url(#${gradientId})`}
                    stroke="white"
                    strokeWidth="4"
                  />
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor="middle"
                    fill="white"
                    fontSize="16"
                    fontWeight="600"
                    style={{ pointerEvents: "none" }}
                  >
                    {dim.name}
                  </text>

                  {/* Outer ring: Topics */}
                  {dim.topics.map((topic, topicIdx) => {
                    const topicAngleStart = dimAngleStart + topicIdx * anglePerTopic;
                    const topicAngleEnd = dimAngleStart + (topicIdx + 1) * anglePerTopic;
                    const topicMidAngle = topicAngleStart + anglePerTopic / 2;

                    const topicLabelPos = polar(
                      CENTER.x,
                      CENTER.y,
                      (R_MIDDLE + R_OUTER) / 2,
                      topicMidAngle
                    );

                    const isHovered = hoveredTopic === topic;
                    const isSelected = selectedTopic === topic;

                    // Border color matches dimension gradient
                    const borderColor = gradient.end;

                    return (
                      <g key={topic}>
                        <path
                          d={wedgePath(R_MIDDLE, R_OUTER, topicAngleStart, topicAngleEnd)}
                          fill={isSelected ? "#1e3a5f" : isHovered ? "#d1dce8" : "#e8eef5"}
                          stroke={borderColor}
                          strokeWidth="2"
                          style={{ cursor: "pointer", transition: "fill 0.2s" }}
                          onClick={() => handleTopicClick(topic)}
                          onMouseEnter={() => setHoveredTopic(topic)}
                          onMouseLeave={() => setHoveredTopic(null)}
                        />
                        <text
                          x={topicLabelPos.x}
                          y={topicLabelPos.y}
                          textAnchor="middle"
                          fill={isSelected ? "white" : "#1e293b"}
                          fontSize="12"
                          fontWeight="500"
                          style={{ 
                            pointerEvents: "none",
                            transition: "fill 0.2s"
                          }}
                        >
                          {topic.split(" ").map((word, i) => (
                            <tspan key={i} x={topicLabelPos.x} dy={i === 0 ? 0 : 14}>
                              {word}
                            </tspan>
                          ))}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right side: Content display (appears when topic is clicked) */}
        {selectedTopic && (
          <div className="w-full lg:flex-1 lg:max-w-2xl">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">{selectedTopic}</h2>
                  {WHY_IT_MATTERS[selectedTopic] && (
                    <p className="text-sm text-slate-600 mt-2 italic">
                      {WHY_IT_MATTERS[selectedTopic]}
                    </p>
                  )}
                </div>
                <button
                  onClick={closeContentView}
                  className="text-slate-400 hover:text-slate-600 text-2xl"
                >
                  ×
                </button>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : topicData.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-600 mb-4">
                    No {selectedTopic.toLowerCase()} captured yet. Share with Alfred or add one here!
                  </p>
                  <button
                    onClick={() => setEditingItem({ id: null, isNew: true })}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
                  >
                    + Add {selectedTopic}
                  </button>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {topicData.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      topic={selectedTopic}
                      onClick={() => handleItemClick(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit modal (only appears when clicking on an individual item) */}
      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800">
                Edit {selectedTopic}
              </h3>
              <button
                onClick={closeEditModal}
                className="text-slate-400 hover:text-slate-600 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="p-6">
              <EditForm
                item={editingItem}
                topic={selectedTopic}
                onSave={(updates) => updateItem(editingItem.id, updates)}
                onDelete={() => deleteItem(editingItem.id)}
                onCancel={closeEditModal}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ItemCard component - displays item content, clickable for editing
function ItemCard({ item, topic, onClick }) {
  return (
    <div 
      className="bg-slate-50 border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      {renderItemContent(item, topic)}
      {item.first_seen_at && (
        <p className="text-xs text-slate-400 mt-3">
          Added {new Date(item.first_seen_at).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

// Helper function to render item content based on topic type
function renderItemContent(item, topic) {
  switch (topic) {
    case "Values":
      return (
        <>
          {item.title && (
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
          )}
          <p className="text-slate-800 font-medium mb-2">{item.value_text}</p>
          {item.definition && (
            <div className="bg-blue-50 p-3 rounded mt-2">
              <p className="text-sm text-slate-700">
                <span className="font-medium">Definition:</span> {item.definition}
              </p>
            </div>
          )}
        </>
      );

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

    case "Goals":
      return (
        <>
          {item.title && (
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
          )}
          <p className="text-slate-800 font-medium mb-2">{item.goal_text}</p>
          {item.why && (
            <div className="bg-blue-50 p-3 rounded mb-2">
              <p className="text-sm text-slate-700">
                <span className="font-medium">Why:</span> {item.why}
              </p>
            </div>
          )}
          {item.time_horizon && (
            <span className="inline-block px-3 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-full">
              {item.time_horizon}
            </span>
          )}
        </>
      );

    case "Energy Sources":
      return (
        <>
          {item.title && (
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
          )}
          <p className="text-slate-800 font-medium mb-2">{item.source_text}</p>
          <div className="flex gap-2 flex-wrap">
            {item.category && (
              <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                {item.category}
              </span>
            )}
            {item.impact_level && (
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                Impact: {item.impact_level}
              </span>
            )}
          </div>
        </>
      );

    case "Energy Drains":
      return (
        <>
          {item.title && (
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
          )}
          <p className="text-slate-800 font-medium mb-2">{item.drain_text}</p>
          <div className="flex gap-2 flex-wrap mb-2">
            {item.category && (
              <span className="inline-block px-3 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                {item.category}
              </span>
            )}
          </div>
          {item.mitigation && (
            <div className="bg-blue-50 p-3 rounded mt-2">
              <p className="text-sm text-slate-700">
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
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
          )}
          <p className="text-slate-800 font-medium mb-2">{item.method_text}</p>
          <div className="flex gap-2 flex-wrap">
            {item.category && (
              <span className="inline-block px-3 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-full">
                {item.category}
              </span>
            )}
            {item.frequency && (
              <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded-full">
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
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
          )}
          <p className="text-slate-800 font-medium mb-2">{item.pattern_text}</p>
          {item.underlying_reason && (
            <div className="bg-amber-50 p-3 rounded mb-2">
              <p className="text-sm text-slate-700">
                <span className="font-medium">Why:</span> {item.underlying_reason}
              </p>
            </div>
          )}
          {item.strategy && (
            <div className="bg-green-50 p-3 rounded">
              <p className="text-sm text-slate-700">
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
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
          )}
          <p className="text-slate-800 font-medium mb-2">{item.system_text}</p>
          <div className="flex gap-2 flex-wrap">
            {item.category && (
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                {item.category}
              </span>
            )}
            {item.effectiveness && (
              <span className="inline-block px-3 py-1 bg-slate-100 text-slate-800 text-xs font-medium rounded-full">
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
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
          )}
          <p className="text-slate-800 font-medium mb-2">{item.composition_text}</p>
          {item.team_type && (
            <span className="inline-block px-3 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-full mb-2">
              {item.team_type}
            </span>
          )}
          {item.dynamics && (
            <div className="bg-slate-50 p-3 rounded mt-2">
              <p className="text-sm text-slate-700">
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
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
          )}
          <p className="text-slate-800 font-medium mb-2">{item.inspiration_text}</p>
          {item.approach && (
            <div className="bg-blue-50 p-3 rounded mb-2">
              <p className="text-sm text-slate-700">
                <span className="font-medium">Approach:</span> {item.approach}
              </p>
            </div>
          )}
          {item.effectiveness && (
            <div className="bg-green-50 p-3 rounded">
              <p className="text-sm text-slate-700">
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
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
          )}
          <p className="text-slate-800 font-medium mb-2">{item.moment_text}</p>
          {item.person && (
            <p className="text-sm text-slate-600 mb-2">
              <span className="font-medium">Person:</span> {item.person}
            </p>
          )}
          {item.outcome && (
            <div className="bg-blue-50 p-3 rounded mb-2">
              <p className="text-sm text-slate-700">
                <span className="font-medium">Outcome:</span> {item.outcome}
              </p>
            </div>
          )}
          {item.learning && (
            <div className="bg-green-50 p-3 rounded">
              <p className="text-sm text-slate-700">
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
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
          )}
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
          {item.title && (
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
          )}
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
}

// EditForm component - handles editing of individual items
function EditForm({ item, topic, onSave, onDelete, onCancel }) {
  const [formData, setFormData] = useState({ ...item });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    const updates = { ...formData };
    delete updates.id;
    delete updates.user_number;
    delete updates.first_seen_at;
    delete updates.updated_at;
    onSave(updates);
  };

  // Render appropriate form fields based on topic
  const renderFormFields = () => {
    switch (topic) {
      case "Values":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title (optional)</label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Value</label>
              <textarea
                value={formData.value_text || ''}
                onChange={(e) => handleChange('value_text', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Definition</label>
              <textarea
                value={formData.definition || ''}
                onChange={(e) => handleChange('definition', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
          </>
        );

      case "Strengths":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title (optional)</label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Strength</label>
              <textarea
                value={formData.strength || ''}
                onChange={(e) => handleChange('strength', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
              <input
                type="text"
                value={formData.source || ''}
                onChange={(e) => handleChange('source', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
          </>
        );

      case "Goals":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title (optional)</label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Goal</label>
              <textarea
                value={formData.goal_text || ''}
                onChange={(e) => handleChange('goal_text', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Why</label>
              <textarea
                value={formData.why || ''}
                onChange={(e) => handleChange('why', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Time Horizon</label>
              <select
                value={formData.time_horizon || ''}
                onChange={(e) => handleChange('time_horizon', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              >
                <option value="">Select...</option>
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </div>
          </>
        );

      case "Failures & Scars":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title (optional)</label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Failure</label>
              <textarea
                value={formData.failure_text || ''}
                onChange={(e) => handleChange('failure_text', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Learning</label>
              <textarea
                value={formData.learning || ''}
                onChange={(e) => handleChange('learning', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Scar</label>
              <textarea
                value={formData.scar || ''}
                onChange={(e) => handleChange('scar', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
          </>
        );

      case "Development Opportunities":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title (optional)</label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Skill</label>
              <textarea
                value={formData.skill || ''}
                onChange={(e) => handleChange('skill', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
              <input
                type="text"
                value={formData.source || ''}
                onChange={(e) => handleChange('source', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
          </>
        );

      // Add more cases for other topic types as needed
      default:
        return <p className="text-slate-600">Edit form for {topic} coming soon...</p>;
    }
  };

  return (
    <div className="space-y-4">
      {renderFormFields()}
      
      <div className="flex gap-3 pt-4 border-t">
        <button
          onClick={handleSubmit}
          className="flex-1 bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-md font-medium"
        >
          {item.id ? 'Save Changes' : 'Create'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2 rounded-md font-medium"
        >
          Cancel
        </button>
        {item.id && (
          <button
            onClick={onDelete}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}