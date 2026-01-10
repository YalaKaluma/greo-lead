/* =========================================================
   MINIMAL CARD FOR MOBILE
   ========================================================= */

export default function GoalCard({ goal, onClick, taskCount = 0 }) {
  
  return (
    <div
      onClick={() => onClick(goal)}
      className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer"
    >
      {/* Title - tiny */}
      <div className="text-[10px] font-medium text-slate-800 leading-tight line-clamp-2">
        {goal.title || goal.goal_text?.substring(0, 40) || 'Untitled'}
      </div>
      
      {/* Task count if exists */}
      {taskCount > 0 && (
        <div className="text-[9px] text-blue-600 mt-0.5">
          {taskCount} tasks
        </div>
      )}
    </div>
  );
}
