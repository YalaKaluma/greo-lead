import React from "react";

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

export default function MyLeadershipJourney() {
  const anglePerDim = 360 / DIMENSIONS.length;

  const handleTopicClick = (topic) => {
    console.log("Clicked topic:", topic);
    // hook to existing side panel / modal
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
            const labelPos = polar(600, 600, 350, midAngle);

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

                  return (
                    <path
                      key={topic}
                      d={wedgePath(R_MIDDLE, R_OUTER, tStart, tEnd)}
                      fill="#E5E7EB"
                      stroke="#CBD5E1"
                      strokeWidth="1"
                      className="cursor-pointer hover:fill-slate-300 transition-colors"
                      onClick={() => handleTopicClick(topic)}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
