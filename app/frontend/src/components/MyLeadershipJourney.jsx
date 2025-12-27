import { useEffect, useState } from "react";
import axios from "axios";

const DIMENSIONS = [
  { key: "vision", label: "Vision & Meaning", angle: -90 },
  { key: "execution", label: "Prioritization & Execution", angle: -18 },
  { key: "people", label: "People Development", angle: 54 },
  { key: "energy", label: "Time & Energy", angle: 126 },
  { key: "learning", label: "Learning & Development", angle: 198 }
];

export default function MyLeadershipJourney({ apiUrl, userNumber }) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJourney();
  }, []);

  async function fetchJourney() {
    const endpoints = {
      goals: "goals",
      values: "values",
      projects: "projects",
      failures: "failures",
      developmentAreas: "development-areas"
    };

    const results = {};
    await Promise.all(
      Object.entries(endpoints).map(async ([key, path]) => {
        try {
          const res = await axios.get(
            `${apiUrl}/api/journey/${path}`,
            { params: { user_number: userNumber } }
          );
          results[key] = res.data || [];
        } catch {
          results[key] = [];
        }
      })
    );

    setData(results);
    setLoading(false);
  }

  if (loading) {
    return <div className="flex justify-center py-20">Loading…</div>;
  }

  const radius = 180;
  const center = 250;

  function dotsForDimension(dimKey) {
    if (dimKey === "vision") return [...(data.goals || []), ...(data.values || [])];
    if (dimKey === "execution") return data.projects || [];
    if (dimKey === "learning") return [...(data.failures || []), ...(data.developmentAreas || [])];
    return [];
  }

  return (
    <div className="flex flex-col items-center py-10">
      <h1 className="text-3xl font-bold text-slate-800 mb-2">
        My Leadership Journey
      </h1>
      <p className="text-slate-600 mb-8">
        Your growth, visualized as a system
      </p>

      <svg width={500} height={500}>
        {/* Center */}
        <circle cx={center} cy={center} r={45} fill="#1e293b" />
        <text
          x={center}
          y={center + 4}
          textAnchor="middle"
          fontSize="12"
          fill="white"
          className="font-semibold"
        >
          Alfred
        </text>

        {DIMENSIONS.map((dim) => {
          const angleRad = (dim.angle * Math.PI) / 180;
          const x = center + radius * Math.cos(angleRad);
          const y = center + radius * Math.sin(angleRad);

          const dots = dotsForDimension(dim.key);

          return (
            <g key={dim.key}>
              {/* Arrow line */}
              <line
                x1={center}
                y1={center}
                x2={x}
                y2={y}
                stroke="#94a3b8"
                strokeWidth="2"
              />

              {/* Label */}
              <text
                x={center + (radius + 25) * Math.cos(angleRad)}
                y={center + (radius + 25) * Math.sin(angleRad)}
                textAnchor="middle"
                fontSize="11"
                fill="#334155"
                className="font-medium"
              >
                {dim.label}
              </text>

              {/* Dots */}
              {dots.map((item, i) => {
                const dotRadius = 6;
                const step = (radius - 50) / (dots.length + 1);
                const r = 50 + step * (i + 1);

                return (
                  <circle
                    key={item.id}
                    cx={center + r * Math.cos(angleRad)}
                    cy={center + r * Math.sin(angleRad)}
                    r={dotRadius}
                    fill="#2563eb"
                  >
                    <title>
                      {item.goal_text ||
                        item.value_text ||
                        item.project_name ||
                        item.failure_text ||
                        item.skill}
                    </title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
