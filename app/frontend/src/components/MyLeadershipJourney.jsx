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
  };

  return (
    <div className="px-10 py-8">
      {/* Page title */}
      <h1 className="text-3xl font-semibold text-slate-800 mb-6">
        My Leadership Journey
      </h1>

      <div className="flex justify-center">
        <svg viewBox="0 0 1200 1200" width="900" height="900">
          {/* Center */}
          <circle cx={600} cy={600} r={R_CENTER} fill="#0F172A" />
          <text
            x={600}
            y={585}
            textAnchor="middle"
            fontSize="30"
            fill="white"
            fontWeight="600"
          >
            Alfred
          </text>
          <text
            x={600}
            y={625}
            textAnchor="middle"
            fontSize="18"
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
                  fontSize="16"
                  fill="#0F172A"
                  fontWeight="500"
                >
                  {dim.name}
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
                        fontSize="13"
                        fill="#1e293b"
                        fontWeight="400"
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
          onClose={closeModal}
        />
      )}
    </div>
  );
}

// Topic Modal Component
function TopicModal({ topic, data, loading, onClose }) {
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
          onClick={(e) => e.stopPropagagation()}
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
                  <TopicCard key={item.id || index} topic={topic} item={item} />
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
function TopicCard({ topic, item }) {
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

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
      {renderContent()}
      {item.first_seen_at && (
        <p className="text-xs text-slate-400 mt-3">
          Added {new Date(item.first_seen_at).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
