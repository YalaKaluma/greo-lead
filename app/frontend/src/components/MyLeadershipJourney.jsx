import React from "react";

/* ============================
   CONFIG
============================ */

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
    "Willpower doesn’t scale. A clear execution system creates progress without mental overload.",

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

/* ============================
   HELPERS
============================ */

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

/* ============================
   COMPONENT
============================ */

export default function MyLeadershipJourney() {
  const anglePerDim = 360 / DIMENSIONS.length;

  const handleTopicClick = (topic) => {
    console.log("Topic clicked:", topic);
    // existing behavior unchanged
  };

  const handleWhyClick = (topic) => {
    alert(WHY_IT_MATTERS[topic]);
  };

  return (
    <div className="px-10 py-8">
      {/* Page title */}
      <h1 className="text-3xl font-semibold text-slate-800 mb-6">
        Alfred Leadership Model
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

            const midAngle = (start + end) / 2;
            const dimLabelPos = polar(600, 600, 350, midAngle);

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
                  x={dimLabelPos.x}
                  y={dimLabelPos.y}
                  textAnchor="middle"
                  fontSize="16"
                  fill="#0F172A"
                  fontWeight="500"
                >
                  {dim.name}
                </text>

                {/* Topics */}
                {dim.topics.map((topic, j) => {
                  const tStart = start + j * topicAngle;
                  const tEnd = tStart + topicAngle;
                  const topicLabelPos = polar(600, 600, 420, (tStart + tEnd) / 2);

                  return (
                    <g key={topic}>
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

                      {/* + Why this matters */}
                      <text
                        x={topicLabelPos.x + 42}
                        y={topicLabelPos.y - 6}
                        fontSize="18"
                        fill="#475569"
                        className="cursor-pointer select-none"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWhyClick(topic);
                        }}
                      >
                        +
                      </text>
                    </g>
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
