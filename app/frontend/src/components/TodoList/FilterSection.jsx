// frontend/src/components/TodoList/FilterSection.jsx
import { getLongTermGoals } from '../../utils/taskHelpers';

/**
 * FilterSection Component
 * 
 * Collapsible filter panel for tasks:
 * - Due date filter (due today, tomorrow, next 7 days, all)
 * - Project filter
 * - Delegate filter
 * - Goal filter with Vision/long-term goals
 * - Clear all filters button
 */
export default function FilterSection({
  filtersCollapsed,
  setFiltersCollapsed,
  filterType,
  setFilterType,
  selectedProject,
  setSelectedProject,
  selectedDelegate,
  setSelectedDelegate,
  selectedGoal,
  setSelectedGoal,
  projects,
  delegates,
  goals,
  hasActiveFilters,
  clearFilters
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg mb-6">
      <button
        onClick={() => setFiltersCollapsed(!filtersCollapsed)}
        className="w-full px-4 py-3 flex items-center justify-between text-slate-700 hover:bg-slate-50 transition-colors rounded-lg"
      >
        <span className="font-semibold">Filters</span>
        <span className="text-xl">{filtersCollapsed ? '▼' : '▲'}</span>
      </button>
      
      {!filtersCollapsed && (
        <div className="border-t border-gray-200 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-shrink-0">
              <label className="text-xs font-medium text-slate-600 mb-1 block">Due Date</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="due_today">Due Today</option>
                <option value="due_tomorrow">Tomorrow</option>
                <option value="next_7_days">Next 7 Days</option>
                <option value="all">All Tasks</option>
              </select>
            </div>

            {projects.length > 0 && (
              <div className="flex-shrink-0">
                <label className="text-xs font-medium text-slate-600 mb-1 block">Project</label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">All Projects</option>
                  {projects.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}

            {delegates.length > 0 && (
              <div className="flex-shrink-0">
                <label className="text-xs font-medium text-slate-600 mb-1 block">Delegated To</label>
                <select
                  value={selectedDelegate}
                  onChange={(e) => setSelectedDelegate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">All Delegates</option>
                  {delegates.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {goals.length > 0 && (
              <div className="flex-shrink-0">
                <label className="text-xs font-medium text-slate-600 mb-1 block">Goal</label>
                <select
                  value={selectedGoal}
                  onChange={(e) => setSelectedGoal(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">All Goals</option>
                  {getLongTermGoals(goals).map(g => {
                    const displayText = g.title || g.goal_text;
                    const truncatedText = displayText.length > 30 ? displayText.substring(0, 30) + '...' : displayText;
                    return <option key={g.id} value={g.id}>{truncatedText}</option>;
                  })}
                </select>
              </div>
            )}

            {hasActiveFilters && (
              <div className="flex-shrink-0 mt-auto">
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                >
                  ✕ Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
