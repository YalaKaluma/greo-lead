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
   CALENDAR HELPERS
   ========================================================= */

const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
};

const shouldShowHabit = (habit) => {
  if (habit.frequency === 'weekdays') {
    const today = new Date();
    return !isWeekend(today);
  }
  return true;
};

const getStatusIcon = (status) => {
  if (status === 'done') return '✅';
  if (status === 'not_done') return '❌';
  return '⭕'; // pending or no data
};

const getStatusColor = (status) => {
  if (status === 'done') return 'bg-green-100 hover:bg-green-200 text-green-800';
  if (status === 'not_done') return 'bg-red-100 hover:bg-red-200 text-red-800';
  return 'bg-slate-100 hover:bg-slate-200 text-slate-400'; // pending
};

/* =========================================================
   CALENDAR COMPONENT
   ========================================================= */

function HabitCalendar({ history, frequency, onUpdateDay }) {
  // Generate last 30 days
  const days = [];
  const today = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    days.push(date);
  }

  // Create lookup map from history
  const historyMap = {};
  if (Array.isArray(history)) {
    history.forEach(h => {
      historyMap[h.date] = h.status;
    });
  }

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleDayClick = (date, currentStatus) => {
    const dateStr = formatDate(date);
    
    // Cycle: pending → done → not_done → pending
    let newStatus = 'done';
    if (currentStatus === 'done') newStatus = 'not_done';
    else if (currentStatus === 'not_done') newStatus = 'pending';
    
    onUpdateDay(dateStr, newStatus);
  };

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">
        Last 30 Days
      </h3>
      
      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Day labels */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-xs font-medium text-slate-500 pb-1">
            {day}
          </div>
        ))}
        
        {/* Empty cells to align first day */}
        {Array.from({ length: days[0].getDay() }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        
        {/* Calendar days */}
        {days.map(date => {
          const dateStr = formatDate(date);
          const status = historyMap[dateStr] || 'pending';
          const isWeekendDay = isWeekend(date);
          const isToday = formatDate(new Date()) === dateStr;
          
          // Gray out weekends for weekday-only habits
          const isDisabled = frequency === 'weekdays' && isWeekendDay;
          
          return (
            <button
              key={dateStr}
              onClick={() => !isDisabled && handleDayClick(date, status)}
              disabled={isDisabled}
              className={`
                aspect-square rounded-lg text-xs font-medium
                transition-all duration-150
                ${isToday ? 'ring-2 ring-blue-500' : ''}
                ${isDisabled 
                  ? 'bg-slate-50 text-slate-300 cursor-not-allowed' 
                  : getStatusColor(status) + ' cursor-pointer'
                }
              `}
            >
              <div>{date.getDate()}</div>
              <div className="text-lg leading-none">{getStatusIcon(status)}</div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 text-xs text-slate-600">
        <div className="flex items-center gap-1">
          <span>⭕</span> Pending
        </div>
        <div className="flex items-center gap-1">
          <span>✅</span> Done
        </div>
        <div className="flex items-center gap-1">
          <span>❌</span> Failed
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   MAIN COMPONENT
   ========================================================= */

export default function MyHabits({ apiUrl, userNumber }) {
  const [habits, setHabits] = useState([]);
  const [goals, setGoals] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [habitHistory, setHabitHistory] = useState([]);

  const [form, setForm] = useState({
    title: '',
    goal_id: null,
    frequency: 'daily'
  });

  /* ---------------- FETCH HABITS ---------------- */

  const fetchHabits = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/habits`, {
        params: { user_number: userNumber }
      });
      if (Array.isArray(res.data)) {
        // Filter based on weekday/weekend
        const filtered = res.data.filter(shouldShowHabit);
        setHabits(filtered);
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

  /* ---------------- FETCH HABIT HISTORY ---------------- */

  const fetchHabitHistory = async (habitId) => {
    try {
      const res = await axios.get(`${apiUrl}/api/habits/${habitId}/history`, {
        params: { 
          user_number: userNumber,
          days: 30 
        }
      });
      if (Array.isArray(res.data)) {
        setHabitHistory(res.data);
      }
    } catch (err) {
      console.error('Error fetching habit history:', err);
      setHabitHistory([]);
    }
  };

  useEffect(() => {
    fetchHabits();
    fetchGoals();
  }, []);

  /* ---------------- MODAL CONTROL ---------------- */

  const openNewHabit = () => {
    setEditingHabit(null);
    setHabitHistory([]);
    setForm({ title: '', goal_id: null, frequency: 'daily' });
    setModalOpen(true);
  };

  const openEditHabit = async (habit) => {
    setEditingHabit(habit);
    setForm({
      title: habit.title,
      goal_id: habit.goal_id ?? null,
      frequency: habit.frequency || 'daily'
    });
    setModalOpen(true);
    
    // Fetch history for this habit
    await fetchHabitHistory(habit.id);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingHabit(null);
    setHabitHistory([]);
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

  /* ---------------- TOGGLE COMPLETION (3-STATE CYCLE) ---------------- */

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

  /* ---------------- UPDATE SPECIFIC DAY ---------------- */

  const updateDay = async (habitId, date, status) => {
    try {
      await axios.post(
        `${apiUrl}/api/habits/${habitId}/update_day`,
        { date, status },
        { params: { user_number: userNumber } }
      );
      
      // Refresh history
      await fetchHabitHistory(habitId);
      fetchHabits(); // Also refresh main list to update streak
    } catch (err) {
      console.error('Error updating day:', err);
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
        {habits.map((h, index) => {
          const todayStatus = h.today_status || 'pending';
          
          return (
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

                {/* TOGGLE (3-state) */}
                <button
                  onClick={() => toggleToday(h.id)}
                  className="text-2xl"
                >
                  {getStatusIcon(todayStatus)}
                </button>

                {/* CONTENT */}
                <div
                  onClick={() => openEditHabit(h)}
                  className={`cursor-pointer ${
                    todayStatus === 'done'
                      ? 'line-through text-slate-400'
                      : todayStatus === 'not_done'
                      ? 'text-red-400'
                      : 'hover:underline'
                  }`}
                >
                  <div className="text-lg">
                    {h.title}
                    {h.frequency === 'weekdays' && (
                      <span className="ml-2 text-xs text-slate-500">
                        (weekdays only)
                      </span>
                    )}
                  </div>

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
                  todayStatus === 'done' 
                    ? 'text-slate-400' 
                    : todayStatus === 'not_done'
                    ? 'text-red-400'
                    : 'text-slate-600'
                }`}
              >
                🔥 {h.streak}-day streak
              </span>
            </div>
          );
        })}
      </div>

      {/* ================= MODAL ================= */}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">

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

            {/* FREQUENCY TOGGLE */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Frequency
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, frequency: 'daily' })}
                  className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                    form.frequency === 'daily'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, frequency: 'weekdays' })}
                  className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                    form.frequency === 'weekdays'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  Weekdays Only
                </button>
              </div>
            </div>

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

            {/* CALENDAR (only for editing existing habits) */}
            {editingHabit && (
              <HabitCalendar 
                history={habitHistory}
                frequency={form.frequency}
                onUpdateDay={(date, status) => updateDay(editingHabit.id, date, status)}
              />
            )}

            {/* ACTIONS */}
            <div className="flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="px-4 py-2 border rounded-lg hover:bg-slate-50"
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