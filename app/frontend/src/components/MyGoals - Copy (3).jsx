import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

/**
 * MyGoals.jsx
 * - Sober unified filters
 * - Medium-term goals sorted by parent long-term goal
 * - Dark blue hierarchy lines
 */

export default function MyGoals({ userNumber }) {
  const [goals, setGoals] = useState([]);
  const [timeFilter, setTimeFilter] = useState("all");

  useEffect(() => {
    axios
      .get("/api/journey/goals", { params: { user_number: userNumber } })
      .then((res) => setGoals(res.data))
      .catch(console.error);
  }, [userNumber]);

  // -----------------------------
  // Helpers
  // -----------------------------
  const goalsById = useMemo(() => {
    const map = {};
    goals.forEach((g) => (map[g.id] = g));
    return map;
  }, [goals]);

  const getChildren = (parentId) =>
    goals.filter((g) => g.parent_goal_id === parentId);

  // -----------------------------
  // Filtered & Sorted Goals
  // -----------------------------
  const visibleGoals = useMemo(() => {
    let filtered = [...goals];

    if (timeFilter !== "all") {
      filtered = filtered.filter((g) => g.time_horizon === timeFilter);
    }

    // 🔹 Medium-term: sort by linked long-term goal
    if (timeFilter === "medium") {
      filtered.sort((a, b) => {
        const parentA = a.parent_goal_id
          ? goalsById[a.parent_goal_id]?.goal_text || ""
          : "zzz";
        const parentB = b.parent_goal_id
          ? goalsById[b.parent_goal_id]?.goal_text || ""
          : "zzz";

        return parentA.localeCompare(parentB);
      });
    }

    return filtered;
  }, [goals, timeFilter, goalsById]);

  // -----------------------------
  // Styling
  // -----------------------------
  const filterButton = (active) => ({
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    background: active ? "#f8fafc" : "white",
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
  });

  const lineStyle = {
    stroke: "#1e3a8a", // dark blue
    strokeWidth: 2,
  };

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div style={{ padding: 24 }}>
      {/* ---------------- Filters ---------------- */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["all", "long", "medium", "short"].map((t) => (
          <button
            key={t}
            style={filterButton(timeFilter === t)}
            onClick={() => setTimeFilter(t)}
          >
            {t === "all"
              ? "All goals"
              : `${t.charAt(0).toUpperCase()}${t.slice(1)} term`}
          </button>
        ))}
      </div>

      {/* ---------------- Goals ---------------- */}
      <div style={{ position: "relative" }}>
        {visibleGoals
          .filter((g) => !g.parent_goal_id)
          .map((goal) => {
            const children = getChildren(goal.id).filter(
              (c) => timeFilter === "all" || c.time_horizon === timeFilter
            );

            return (
              <div key={goal.id} style={{ marginBottom: 32 }}>
                {/* Parent goal */}
                <GoalCard goal={goal} />

                {/* Children */}
                {children.length > 0 && (
                  <div style={{ marginLeft: 40, marginTop: 12 }}>
                    {children.map((child) => (
                      <div
                        key={child.id}
                        style={{ display: "flex", alignItems: "center" }}
                      >
                        <svg width="30" height="20">
                          <line
                            x1="30"
                            y1="10"
                            x2="0"
                            y2="10"
                            style={lineStyle}
                          />
                        </svg>
                        <GoalCard goal={child} compact />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// -----------------------------
// Goal Card
// -----------------------------
function GoalCard({ goal, compact = false }) {
  return (
    <div
      style={{
        padding: compact ? 10 : 14,
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "white",
        maxWidth: 600,
      }}
    >
      {goal.title && (
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{goal.title}</div>
      )}
      <div style={{ fontSize: 14, color: "#374151" }}>{goal.goal_text}</div>
      {goal.why && !compact && (
        <div
          style={{
            marginTop: 6,
            fontSize: 13,
            color: "#6b7280",
            fontStyle: "italic",
          }}
        >
          Why: {goal.why}
        </div>
      )}
    </div>
  );
}
