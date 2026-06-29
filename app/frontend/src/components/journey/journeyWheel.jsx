import React from "react";
import {
  CENTER,
  DIMENSIONS,
  LEADERSHIP_QUADRANT_LABELS,
  R_BELT,
  R_CENTER,
  R_DOMAIN,
  R_SUBDOMAIN,
  arcPath,
  getBelt,
  getBeltById,
  getStatusProgress,
  getTopicItems,
  polar,
  splitLabel,
  wedgePath
} from "./journeyModel";

export function LeadershipWheel({ selectedDimensionId, activeTopic, dimensionStates, topicData, journeyBelt, onSelectDimension, onSelectSubdomain, onSelectCenter }) {
  const anglePerDim = 360 / DIMENSIONS.length;
  const haloBelt = journeyBelt || getBeltById("white");

  return (
    <svg viewBox="0 0 1000 1000" className="h-auto w-full">
      <defs>
        <filter id="momentum-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g onClick={onSelectCenter} style={{ cursor: onSelectCenter ? "pointer" : "default" }}>
        <circle cx={CENTER.x} cy={CENTER.y} r={R_CENTER} fill="#101827" />
        <text x={CENTER.x} y={CENTER.y - 24} textAnchor="middle" fill="white" fontSize="27" fontWeight="700" pointerEvents="none">
          Executive
        </text>
        <text x={CENTER.x} y={CENTER.y + 8} textAnchor="middle" fill="#d9c8a6" fontSize="23" fontWeight="600" pointerEvents="none">
          Operating
        </text>
        <text x={CENTER.x} y={CENTER.y + 39} textAnchor="middle" fill="#d9c8a6" fontSize="23" fontWeight="600" pointerEvents="none">
          System
        </text>
      </g>

      {DIMENSIONS.map((dimension, index) => {
        const start = index * anglePerDim;
        const end = (index + 1) * anglePerDim;
        const mid = start + anglePerDim / 2;
        const dimensionState = dimensionStates[dimension.id];
        const belt = getBelt(dimensionState.beltIndex);
        const isSelected = selectedDimensionId === dimension.id;
        const labelPos = polar(CENTER.x, CENTER.y, (R_CENTER + R_DOMAIN) / 2 + 4, mid);
        const subdomainAngle = anglePerDim / dimension.topics.length;

        return (
          <g key={dimension.id}>
            <path
              d={wedgePath(R_CENTER, R_DOMAIN, start, end)}
              fill={belt.color}
              stroke={isSelected ? "#0f172a" : "#ffffff"}
              strokeWidth={isSelected ? 8 : 4}
              filter={dimensionState.momentum ? "url(#momentum-glow)" : undefined}
              opacity={isSelected ? 1 : 0.92}
              onClick={() => onSelectDimension(dimension.id)}
              style={{ cursor: "pointer" }}
            />
            <text
              x={labelPos.x}
              y={labelPos.y - 8}
              textAnchor="middle"
              fill={belt.text}
              fontSize="16"
              fontWeight="700"
              pointerEvents="none"
            >
              {splitLabel(dimension.name, 11).map((part, partIndex) => (
                <tspan key={part} x={labelPos.x} dy={partIndex === 0 ? 0 : 19}>
                  {part}
                </tspan>
              ))}
            </text>

            {dimension.topics.map((topic, topicIndex) => {
              const topicStart = start + topicIndex * subdomainAngle;
              const topicEnd = topicStart + subdomainAngle;
              const topicMid = topicStart + subdomainAngle / 2;
              const topicItems = getTopicItems(topic, topicData);
              const hasEvidence = topicItems.length > 0;
              const isActiveTopic = isSelected && activeTopic === topic.label;
              const topicPos = polar(CENTER.x, CENTER.y, (R_DOMAIN + R_SUBDOMAIN) / 2, topicMid);

              return (
                <g key={topic.id}>
                  <path
                    d={wedgePath(R_DOMAIN, R_SUBDOMAIN, topicStart, topicEnd)}
                    fill={isActiveTopic ? "#0f172a" : isSelected ? "#1f2937" : hasEvidence ? "#f8fafc" : "#ffffff"}
                    stroke={isActiveTopic ? belt.color : "#d8d3c6"}
                    strokeWidth={isActiveTopic ? "5" : "3"}
                    onClick={() => onSelectSubdomain(dimension.id, topic)}
                    style={{ cursor: "pointer" }}
                  />
                  <path
                    d={arcPath(R_BELT, topicStart + 2, topicEnd - 2)}
                    fill="none"
                    stroke={haloBelt.color}
                    strokeWidth="12"
                    strokeLinecap="butt"
                    pointerEvents="none"
                  />
                  <text
                    x={topicPos.x}
                    y={topicPos.y - 12}
                    textAnchor="middle"
                    fill={isSelected ? "#ffffff" : "#334155"}
                    fontSize="13"
                    fontWeight={hasEvidence ? "700" : "600"}
                    pointerEvents="none"
                  >
                    {splitLabel(topic.label, 12).slice(0, 3).map((part, partLineIndex) => (
                      <tspan key={part} x={topicPos.x} dy={partLineIndex === 0 ? 0 : 17}>
                        {part}
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
  );
}
