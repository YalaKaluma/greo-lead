import { useEffect, useState } from 'react';
import axios from 'axios';

/* =========================================================
   GOAL HELPERS — COPIED 1:1 FROM TodoList.jsx
   ========================================================= */

const getSortedGoals = (goals) => {
  const longTerm = goals.filter(g => g.time_horizon === 'long');
  const mediumTerm = goals.filter(g => g.time_horizon === 'medium');
  const shortTerm = goals.filter(g => g.time_horizon === 'short');

  const result = [];

  longTerm.forEach(lt => {
    result.push(lt);

    const relatedMedium = mediumTerm.filter(mt => mt.parent_goal_id === lt.id);
    relatedMedium.forEach(mt => {
      result.push(mt);

      const relatedShort = shortTerm.filter(st => st.parent_goal_id === mt.id);
      relatedShort.forEach(st => result.push(st));
    });
  });

  // Orphaned goals
  mediumTerm.forEach(mt => {
    if (!result.includes(mt)) result.push(mt);
  });
  shortTerm.forEach(st => {
    if (!result.includes(st)) result.push(st);
  });

  return result;
};

const getGoalIndentation = (timeHorizon) => {
  if (timeHorizon === 'long') return '';
  if (timeHorizon === 'medium') return '\u00A0\u00A0\u00A0\u00A0';
  if (timeHorizon === 'short') return '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';
  return '';
};

/* =========================================================
   MAIN COMPONENT
   ========================================================= */

export default function MyHabits({ apiUrl, userNumber }) {
  const [habits, setHabits] = useState([]);
  const [goals, setGoals] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);

  const [form, setForm] = useState({
    title: '',
    goal_id: null
  });

  /* ---------------- FETCH HABITS ---------------- */

  const fetchHabits = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/habits`, {
        params: { user_number: userNumber }
      });
      if (Array.isArray(res.data)) {
        setHabits(res.data);
      }
    } catch (err) {
      console.error('Error fetching habits:', err);
    }
  };

  /* ---------------- FETCH GOALS (SAME AS TODOLIST) ---------------- */

  const fetchGoals = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/journey/goals`, {
        params: { user_number: userNumber }
      });
      if (res.data && Array.isArray(res.data)) {
        setGoals(res.data);
      }
    } catch (err) {
      console.error('Error fetching goals:', err);
    }
  };

  useEffect(() => {
    fetchHabits();
    fetchGoals();
  }, []);

  /* ---------------- MODAL CONTROL ---------------- */

  const openNewHabit = () => {
    setEditingHabit(null);
    setForm({ title: '', goal_id: null });
    setModalOpen(true);
  };

  const openEditHabit = (habit) => {
    setEditingHabit(habit);
    setForm({
      title: habit.title,
      goal_id: habit.goal_id ?? null
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingHabit(null);
  };

  /* ---------------- SAVE HABIT ---------------- */

  const saveHabit = async () => {
    if (!form.title.trim()) return;

    try {
      if (editingHabit) {
        await axios.put(
          `${apiUrl}/api/habits/${editingHabit.id}`,
          form,
          { params: { user_number: userNumber } }
        );
      } else {
        await axios.post(
          `${apiUrl}/api/habits`,
          form,
          { params: { user_number: userNumber } }
        );
      }

      closeModal();
      fetchHabits();
    } catch (err) {
      console.error('Error saving habit:', err);
    }
  };

  /* ---------------- TOGGLE COMPLETION ---------------- */

  const toggleToday = async (habitId) => {
    try {
      await axios.post(
        `${apiUrl}/api/habits/${habitId}/toggle_today`,
        {},
        { params: { user_number: userNumber } }
      );
      fetchHabits();
    } catch (err) {
      console.error('Error toggling habit:', err);
    }
  };

  /* ---------------- DRAG & DROP (FRONTEND ONLY) ---------------- */

  const onDragStart = (e, index) => {
    e.dataTransfer.setData('fromIndex', index);
  };

  const onDrop = (e, index) => {
    const fromIndex = e.dataTransfer.getData('fromIndex');
    if (fromIndex === null) return;

    const updated = [...habits];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(index, 0, moved);

    setHabits(updated);
  };

  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <div className="max-w-4xl mx-auto p-6">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-slate-800">
          My Executive Habits
        </h1>
        <button
          onClick={openNewHabit}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          + Add Habit
        </button>
      </div>

      {/* HABIT LIST */}
      <div className="space-y-3">
        {habits.map((h, index) => (
          <div
            key={h.id}
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, index)}
            className="flex items-center justify-between bg-white border rounded-lg px-4 py-3"
          >
            <div className="flex items-center gap-3 flex-1">

              {/* DRAG HANDLE */}
              <span className="cursor-grab text-slate-300">⋮⋮</span>

              {/* TOGGLE */}
              <button
                onClick={() => toggleToday(h.id)}
                className="text-2xl"
              >
                {h.completed_today ? '✅' : '⭕'}
              </button>

              {/* CONTENT */}
              <div
                onClick={() => openEditHabit(h)}
                className={`cursor-pointer ${
                  h.completed_today
                    ? 'line-through text-slate-400'
                    : 'hover:underline'
                }`}
              >
                <div className="text-lg">{h.title}</div>

                {h.goal_text && (
                  <div className="text-sm text-slate-500">
                    🎯 {h.goal_text}
                  </div>
                )}
              </div>
            </div>

            {/* STREAK — ALWAYS VISIBLE */}
            <span
              className={`text-sm ${
                h.completed_today ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              🔥 {h.streak}-day streak
            </span>
          </div>
        ))}
      </div>

      {/* ================= MODAL ================= */}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-lg p-6">

            <h2 className="text-xl font-semibold mb-4">
              {editingHabit ? 'Edit Habit' : 'New Habit'}
            </h2>

            {/* TITLE */}
            <input
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value })
              }
              placeholder="Habit title"
              className="w-full px-4 py-2 border rounded-lg mb-4"
              autoFocus
            />

            {/* GOAL DROPDOWN — IDENTICAL LOGIC TO TODOLIST */}
            <select
              value={form.goal_id || ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  goal_id: e.target.value
                    ? parseInt(e.target.value)
                    : null
                })
              }
              className="w-full px-4 py-2 border rounded-lg mb-6"
            >
              <option value="">No linked goal</option>

              {getSortedGoals(goals).map(g => {
                const label = g.title || g.goal_text;
                const truncated =
                  label.length > 40 ? label.slice(0, 40) + '…' : label;

                return (
                  <option key={g.id} value={g.id}>
                    {getGoalIndentation(g.time_horizon)}
                    {truncated}
                  </option>
                );
              })}
            </select>

            {/* ACTIONS */}
            <div className="flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={saveHabit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Save
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
