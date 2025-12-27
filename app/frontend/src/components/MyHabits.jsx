import { useEffect, useState } from 'react'
import axios from 'axios'

export default function MyHabits({ apiUrl, userNumber }) {
  const [habits, setHabits] = useState([])
  const [goals, setGoals] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingHabit, setEditingHabit] = useState(null)
  const [form, setForm] = useState({ title: '', goal_id: '' })

  /* ------------------ DATA ------------------ */

  const fetchHabits = async () => {
    const res = await axios.get(`${apiUrl}/api/habits`, {
      params: { user_number: userNumber }
    })
    setHabits(res.data)
  }

  const fetchGoals = async () => {
    const res = await axios.get(`${apiUrl}/api/journey/goals`, {
      params: { user_number: userNumber }
    })
    setGoals(res.data.data || [])
  }

  useEffect(() => {
    fetchHabits()
    fetchGoals()
  }, [])

  /* ------------------ SORT GOALS ------------------ */

  const goalOrder = { long: 0, medium: 1, short: 2 }

  const sortedGoals = [...goals].sort(
    (a, b) => goalOrder[a.time_horizon] - goalOrder[b.time_horizon]
  )

  /* ------------------ MODAL ------------------ */

  const openNew = () => {
    setEditingHabit(null)
    setForm({ title: '', goal_id: '' })
    setModalOpen(true)
  }

  const openEdit = (habit) => {
    setEditingHabit(habit)
    setForm({
      title: habit.title,
      goal_id: habit.goal_id || ''
    })
    setModalOpen(true)
  }

  const saveHabit = async () => {
    if (!form.title.trim()) return

    if (editingHabit) {
      await axios.put(
        `${apiUrl}/api/habits/${editingHabit.id}`,
        form,
        { params: { user_number: userNumber } }
      )
    } else {
      await axios.post(
        `${apiUrl}/api/habits`,
        form,
        { params: { user_number: userNumber } }
      )
    }

    setModalOpen(false)
    fetchHabits()
  }

  /* ------------------ TOGGLE ------------------ */

  const toggleToday = async (id) => {
    await axios.post(
      `${apiUrl}/api/habits/${id}/toggle_today`,
      {},
      { params: { user_number: userNumber } }
    )
    fetchHabits()
  }

  /* ------------------ DRAG ------------------ */

  const onDragStart = (e, index) => {
    e.dataTransfer.setData('index', index)
  }

  const onDrop = (e, index) => {
    const from = e.dataTransfer.getData('index')
    if (from === null) return

    const updated = [...habits]
    const [moved] = updated.splice(from, 1)
    updated.splice(index, 0, moved)
    setHabits(updated)
  }

  /* ------------------ UI ------------------ */

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-slate-800">
          My Executive Habits
        </h1>
        <button
          onClick={openNew}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          + Add Habit
        </button>
      </div>

      {/* HABITS */}
      <div className="space-y-3">
        {habits.map((h, i) => (
          <div
            key={h.id}
            draggable
            onDragStart={(e) => onDragStart(e, i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, i)}
            className="flex items-center justify-between bg-white border rounded-lg px-4 py-3"
          >
            <div className="flex items-center gap-3 flex-1">
              <span className="cursor-grab text-slate-400">⋮⋮</span>

              <button
                onClick={() => toggleToday(h.id)}
                className="text-2xl"
              >
                {h.completed_today ? '✅' : '⭕'}
              </button>

              <div
                onClick={() => openEdit(h)}
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

            <span
              className={`text-sm ${
                h.completed_today
                  ? 'text-slate-400'
                  : 'text-slate-600'
              }`}
            >
              🔥 {h.streak}-day streak
            </span>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-lg p-6">
            <h2 className="text-xl font-semibold mb-4">
              {editingHabit ? 'Edit Habit' : 'New Habit'}
            </h2>

            <input
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value })
              }
              placeholder="Habit title"
              className="w-full px-4 py-2 border rounded-lg mb-3"
            />

            <select
              value={form.goal_id}
              onChange={(e) =>
                setForm({ ...form, goal_id: e.target.value })
              }
              className="w-full px-4 py-2 border rounded-lg mb-4"
            >
              <option value="">No linked goal</option>
              {sortedGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.time_horizon === 'medium'
                    ? '  '
                    : g.time_horizon === 'short'
                    ? '    '
                    : ''}
                  {g.goal_text}
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg border"
              >
                Cancel
              </button>
              <button
                onClick={saveHabit}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
