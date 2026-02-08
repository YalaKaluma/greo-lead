import GoalCard from './GoalCard';

/* =========================================================
   PROGRESS REVIEW - Goals with conversation recaps
   ========================================================= */

export default function GoalReviewRecap({ 
  goals, 
  reviewSessions,
  expandedGoalId, 
  onCardClick, 
  taskCounts 
}) {
  
  // Build map of goal_id -> latest review session
  const goalReviews = {};
  reviewSessions.forEach(session => {
    if (!goalReviews[session.goal_id]) {
      goalReviews[session.goal_id] = session;
    }
  });

  // Get the most recent review overall
  const latestReview = reviewSessions.length > 0 ? reviewSessions[0] : null;

  const buildTree = () => {
    const longTermGoals = goals.long || [];
    
    return longTermGoals.map(ltGoal => {
      const mediumChildren = (goals.medium || []).filter(g => g.parent_goal_id === ltGoal.id);
      
      return {
        ...ltGoal,
        children: mediumChildren.map(mtGoal => ({
          ...mtGoal,
          children: (goals.short || []).filter(g => g.parent_goal_id === mtGoal.id)
        }))
      };
    });
  };

  const tree = buildTree();

  return (
    <div className="space-y-6">
      {/* Latest Review Summary */}
      {latestReview && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-1">
                Latest Goal Review
              </h3>
              <p className="text-sm text-slate-600">
                {new Date(latestReview.session_ended_at).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            </div>
            <div className="text-sm px-3 py-1 bg-white border border-blue-300 rounded-full text-blue-700 font-medium">
              {latestReview.goal_title}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white rounded-lg p-4 border border-blue-100">
            <h4 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">
              Session Summary
            </h4>
            <div className="text-slate-700 leading-relaxed whitespace-pre-wrap mb-4">
              {latestReview.summary}
            </div>

            {/* Key insights in grid */}
            {(latestReview.key_progress || latestReview.key_blockers || latestReview.chosen_adjustment) && (
              <div className="grid md:grid-cols-3 gap-3 mt-4">
                {latestReview.key_progress && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">
                      Progress
                    </div>
                    <p className="text-sm text-green-900">{latestReview.key_progress}</p>
                  </div>
                )}

                {latestReview.key_blockers && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
                      Blockers
                    </div>
                    <p className="text-sm text-amber-900">{latestReview.key_blockers}</p>
                  </div>
                )}

                {latestReview.chosen_adjustment && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
                      Actions Agreed
                    </div>
                    <p className="text-sm text-blue-900">{latestReview.chosen_adjustment}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Goals Tree - Same as Goal Setting */}
      <div className="space-y-1 lg:space-y-4">
        {tree.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500">No goals yet</p>
          </div>
        ) : (
          tree.map(ltGoal => {
            const isExpanded = expandedGoalId === ltGoal.id;
            const hasChildren = ltGoal.children && ltGoal.children.length > 0;
            const hasReview = goalReviews[ltGoal.id];
            
            if (expandedGoalId && expandedGoalId !== ltGoal.id) {
              return null;
            }
            
            return (
              <div key={ltGoal.id}>
                {!isExpanded ? (
                  <div>
                    <GoalCard 
                      goal={ltGoal}
                      onClick={onCardClick}
                      taskCount={taskCounts[ltGoal.id] || 0}
                      isInTree={false}
                    />
                    {/* Show review preview if exists */}
                    {hasReview && (
                      <div className="mt-2 ml-4 p-3 bg-slate-50 border-l-4 border-blue-400 rounded text-sm text-slate-600">
                        <span className="font-medium text-slate-700">Last reviewed: </span>
                        {new Date(hasReview.session_ended_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {hasReview.summary && (
                          <p className="mt-1 line-clamp-2">{hasReview.summary.substring(0, 150)}...</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="border border-blue-300 rounded p-1.5 lg:p-6 lg:rounded-xl bg-blue-50/20 lg:bg-blue-50/30">
                    {/* LT GOAL */}
                    <div className="mb-2 lg:mb-6">
                      <GoalCard 
                        goal={ltGoal}
                        onClick={onCardClick}
                        taskCount={taskCounts[ltGoal.id] || 0}
                        isInTree={true}
                      />
                      {hasReview && (
                        <div className="mt-2 p-3 bg-white border border-blue-200 rounded-lg text-sm">
                          <span className="font-medium text-slate-700">Last reviewed: </span>
                          {new Date(hasReview.session_ended_at).toLocaleDateString()}
                          {hasReview.summary && (
                            <p className="mt-2 text-slate-600">{hasReview.summary}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* MT GOALS */}
                    {hasChildren && (
                      <div 
                        className="grid gap-1.5 lg:gap-4"
                        style={{ gridTemplateColumns: `repeat(${ltGoal.children.length}, 1fr)` }}
                      >
                        {ltGoal.children.map((mtGoal) => {
                          const hasSTChildren = mtGoal.children && mtGoal.children.length > 0;
                          const mtReview = goalReviews[mtGoal.id];
                          
                          return (
                            <div key={mtGoal.id}>
                              {!hasSTChildren ? (
                                <div>
                                  <GoalCard 
                                    goal={mtGoal}
                                    onClick={onCardClick}
                                    taskCount={taskCounts[mtGoal.id] || 0}
                                    isInTree={true}
                                  />
                                  {mtReview && (
                                    <div className="mt-1.5 p-2 bg-white border border-slate-200 rounded text-xs text-slate-600">
                                      {new Date(mtReview.session_ended_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="border border-slate-300 rounded p-1.5 lg:p-4 lg:rounded-lg bg-white">
                                  {/* MT GOAL */}
                                  <div className="mb-1.5 lg:mb-4">
                                    <GoalCard 
                                      goal={mtGoal}
                                      onClick={onCardClick}
                                      taskCount={taskCounts[mtGoal.id] || 0}
                                      isInTree={true}
                                    />
                                    {mtReview && (
                                      <div className="mt-1.5 p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
                                        {new Date(mtReview.session_ended_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* ST GOALS */}
                                  <div className="space-y-1.5 lg:space-y-3 pl-2 lg:pl-8 border-l border-slate-200 lg:border-l-2">
                                    {mtGoal.children.map((stGoal) => {
                                      const stReview = goalReviews[stGoal.id];
                                      return (
                                        <div key={stGoal.id}>
                                          <GoalCard 
                                            goal={stGoal}
                                            onClick={onCardClick}
                                            taskCount={taskCounts[stGoal.id] || 0}
                                            isInTree={true}
                                          />
                                          {stReview && (
                                            <div className="mt-1 p-1.5 bg-slate-50 border border-slate-200 rounded text-[10px] lg:text-xs text-slate-600">
                                              {new Date(stReview.session_ended_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Empty state */}
      {reviewSessions.length === 0 && (
        <div className="text-center py-12 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="text-6xl mb-4">💬</div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">
            No Goal Reviews Yet
          </h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Chat with Alfred to review your goals. Your conversation summaries will appear here.
          </p>
        </div>
      )}
    </div>
  );
}
