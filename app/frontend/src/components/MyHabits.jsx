import { useEffect, useState } from 'react';
import axios from 'axios';

export default function MyHabits({ apiUrl, userNumber }) {
  const [habits, setHabits] = useState([]);
  const [newHabit, setNewHabit] = useState('');
  const [editingHabitId, setEditingHabitId] = useState(null);
  const [editingValue, setEditingValue] = useState('');

  const fetchHabits = async () => {
    const res = await axios.get(`${apiUrl}/api/habits`, {
      params: { user_number: userNumber }
    });
    setHabits(res.data);
  };

  useEffect(() => {
    fetchHabits();
  }, []);

  const toggleToday = async (id) => {
    await axios.post(
      `${apiUrl}/api/habits/${id}/toggle_today`,
      {},
      { params: { user_number: userNumber } }
    );
    fetchHabits();
  };

  const addHabit = async () => {
    if (!newHabit.trim()) return;

    await axios.post(
      `${apiUrl}/api/habits`,
      { title: newHabit },
      { params: { user_number: userNumber } }
    );
    setNewHabit('');
    fetchHabits();
  };

  const updateHabit = async (id, newTitle) => {
    if (!newTitle.trim()) {
      setEditingHabitId(null);
      return;
    }

    await axios.put(
      `${apiUrl}/api/habits/${id}`,
      { title: newTitle },
      { params: { user_number: userNumber } }
    );

    setEditingHabitId(null);
    setEditingValue('');
    fetchHabits();
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-slate-800 mb-6">
        My Executive Habits
      </h1>

      {/* Add habit */}
      <div className="flex gap-2 mb-6">
        <input
          value={newHabit}
          onChange={(e) => setNewHabit(e.target.value)}
          placeholder="Add a daily habit…"
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        <button
          onClick={addHabit}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          + Add
        </button>
      </div>

      {/* Habit list */}
      <div className="space-y-3">
        {habits.map(h => (
          <div
            key={h.id}
            className="flex items-center justify-between bg-white border rounded-lg px-4 py-3"
          >
            <div className="flex items-center gap-3 flex-1">
              <button
                onClick={() => toggleToday(h.id)}
                className="text-2xl"
              >
                {h.completed_today ? '✅' : '⭕'}
              </button>

              {editingHabitId === h.id ? (
                <input
                  value={editingValue}
                  autoFocus
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={() => updateHabit(h.id, editingValue)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      updateHabit(h.id, editingValue);
                    }
                    if (e.key === 'Escape') {
                      setEditingHabitId(null);
                      setEditingValue('');
                    }
                  }}
                  className="text-lg px-2 py-1 border rounded-md w-full"
                />
              ) : (
                <span
                  onClick={() => {
                    if (h.completed_today) return;
                    setEditingHabitId(h.id);
                    setEditingValue(h.title);
                  }}
                  className={`text-lg cursor-pointer ${
                    h.completed_today
                      ? 'line-through text-slate-400'
                      : 'hover:underline'
                  }`}
                >
                  {h.title}
                </span>
              )}
            </div>

            {!h.completed_today && (
              <span className="text-sm text-slate-600">
                🔥 {h.streak}-day streak
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
