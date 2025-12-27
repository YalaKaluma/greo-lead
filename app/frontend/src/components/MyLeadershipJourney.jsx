import React from "react";

const CENTER = { x: 500, y: 500 };
const R_CENTER = 120;
const R_MIDDLE = 240;
const R_OUTER = 380;

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
    // TODO: open side panel / modal here
  };

  return (
    <div className="flex justify-center py-12">
      <svg viewBox="0 0 1000 1000" width="700" height="700">
        {/* Center */}
        <circle cx={500} cy={500} r={R_CENTER} fill="#0F172A" />
        <text
          x={500}
          y={485}
          textAnchor="middle"
          fontSize="28"
          fill="white"
          fontWeight="600"
        >
          Alfred
        </text>
        <text
          x={500}
          y={525}
          textAnchor="middle"
          fontSize="18"
          fill="#CBD5E1"
        >
          Leadership OS
        </text>

        {/* Dimensions + Topics */}
        {DIMENSIONS.map((dim, i) => {
          const start = i * anglePerDim;
          const end = start + anglePerDim;
          const topicAngle = anglePerDim / dim.topics.length;

          return (
            <g key={dim.name}>
              {/* Middle ring */}
              <path
                d={wedgePath(R_CENTER, R_MIDDLE, start, end)}
                fill="#CBD5E1"
                stroke="#E5E7EB"
                strokeWidth="1"
              />

              {/* Dimension label */}
              {(() => {
                const mid = (start + end) / 2;
                const p = polar(CENTER.x, CENTER.y, 300, mid);
                return (
                  <text
                    x={p.x}
                    y={p.y}
                    textAnchor="middle"
                    fontSize="15"
                    fill="#0F172A"
                    fontWeight="500"
                  >
                    {dim.name}
                  </text>
                );
              })()}

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
                    className="cursor-pointer hover:fill-slate-300"
                    onClick={() => handleTopicClick(topic)}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
