import React, { useState, useEffect } from "react";
import axios from "axios";

const MyGoals = () => {
  const [goals, setGoals] = useState([]);
  const [newGoal, setNewGoal] = useState("");

  useEffect(() => {
    // ✅ Relative path - works locally and in production
    axios.get("/api/goals")
      .then((response) => {
        setGoals(response.data);
      })
      .catch((error) => {
        console.error("Error fetching goals:", error);
      });
  }, []);

  const handleAddGoal = () => {
    if (!newGoal.trim()) return;

    axios.post("/api/goals", { title: newGoal })
      .then((response) => {
        setGoals((prevGoals) => [...prevGoals, response.data]);
        setNewGoal("");
      })
      .catch((error) => {
        console.error("Error adding goal:", error);
      });
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">My Goals</h2>

      <div className="flex items-center mb-4">
        <input
          type="text"
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          placeholder="Add a new goal..."
          className="border border-gray-300 px-3 py-2 rounded mr-2 flex-1"
        />
        <button
          onClick={handleAddGoal}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Add
        </button>
      </div>

      <ul>
        {goals.map((goal) => (
          <li
            key={goal.id}
            className="p-2 border-b border-gray-200"
          >
            {goal.title}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MyGoals;
