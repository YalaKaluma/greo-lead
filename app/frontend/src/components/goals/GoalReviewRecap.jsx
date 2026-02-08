import GoalCard from './GoalCard';

/* =========================================================
   PROGRESS REVIEW - Card-based layout with goal-specific reviews
   ========================================================= */

export default function GoalReviewRecap({ 
  goals, 
  reviewSessions,
  expandedGoalId, 
  onCardClick, 
  taskCounts 
}) {
  
  // Build map of goal_id -> latest review session for THAT goal
  const goalReviews = {};
  reviewSessions.forEach(session => {
    if (!goalReviews[session.goal_id]) {
      goalReviews[session.goal_id] = session;
    }
  });

  // Get the most recent review overall (for top section)
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
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800 mb-1">
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
            <div className="text-sm px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-700">
              {latestReview.goal_title}
            </div>
          </div>

          {/* Session Summary */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Session Summary
            </h4>
            <p className="text-slate-700 leading-relaxed">
              {latestReview.summary}
            </p>
          </div>

          {/* Key insights - NO COLORS, just clean boxes */}
          {(latestReview.key_progress || latestReview.key_blockers || latestReview.chosen_adjustment) && (
            <div className="grid md:grid-cols-3 gap-3">
              {latestReview.key_progress && (
                <div className="bg-white border border-slate-200 rounded p-3">
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
                    Progress
                  </div>
                  <p className="text-sm text-slate-700">{latestReview.key_progress}</p>
                </div>
              )}

              {latestReview.key_blockers && (
                <div className="bg-white border border-slate-200 rounded p-3">
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
                    Blockers
                  </div>
                  <p className="text-sm text-slate-700">{latestReview.key_blockers}</p>
                </div>
              )}

              {latestReview.chosen_adjustment && (
                <div className="bg-white border border-slate-200 rounded p-3">
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
                    Actions Agreed
                  </div>
                  <p className="text-sm text-slate-700">{latestReview.chosen_adjustment}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Goals Tree with Card-Based Breakdown */}
      <div className="space-y-4">
        {tree.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500">No goals yet</p>
          </div>
        ) : (
          tree.map(ltGoal => {
            const isExpanded = expandedGoalId === ltGoal.id;
            const hasChildren = ltGoal.children && ltGoal.children.length > 0;
            const ltReview = goalReviews[ltGoal.id];
            
            if (expandedGoalId && expandedGoalId !== ltGoal.id) {
              return null;
            }
            
            return (
              <div key={ltGoal.id}>
                {!isExpanded ? (
                  /* Collapsed view - just the LT goal card */
                  <div>
                    <GoalCard 
                      goal={ltGoal}
                      onClick={onCardClick}
                      taskCount={taskCounts[ltGoal.id] || 0}
                      isInTree={false}
                    />
                    {/* Show THIS goal's review if exists */}
                    {ltReview && (
                      <div className="mt-2 ml-4 p-3 bg-slate-50 border-l-4 border-slate-400 rounded text-sm">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-medium text-slate-700">Last reviewed:</span>
                          <span className="text-slate-600">
                            {new Date(ltReview.session_ended_at).toLocaleDateString('en-US', { 
                              month: 'numeric', 
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                        <p className="text-slate-600 line-clamp-2">{ltReview.summary}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Expanded view - CARD-BASED BREAKDOWN like your screenshot */
                  <div className="border-2 border-slate-300 rounded-lg p-4 lg:p-6 bg-white">
                    {/* Long-Term Goal Card */}
                    <div className="mb-6">
                      <div className="border-2 border-blue-300 rounded-lg p-4 bg-blue-50/20">
                        <h3 className="text-xl font-bold text-slate-800 mb-2">
                          {ltGoal.title || ltGoal.goal_text}
                        </h3>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-slate-600">Long Term</span>
                          {taskCounts[ltGoal.id] > 0 && (
                            <span className="text-blue-600">
                              {taskCounts[ltGoal.id]} task{taskCounts[ltGoal.id] !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* THIS goal's review */}
                      {ltReview && (
                        <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                          <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-sm font-medium text-slate-700">Last reviewed:</span>
                            <span className="text-sm text-slate-600">
                              {new Date(ltReview.session_ended_at).toLocaleDateString('en-US', { 
                                month: 'numeric', 
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700">{ltReview.summary}</p>
                        </div>
                      )}
                    </div>

                    {/* How this goal breaks down */}
                    {hasChildren && (
                      <div>
                        <h4 className="text-sm font-medium text-slate-600 mb-3">
                          How this goal breaks down
                        </h4>
                        
                        {/* Medium-term goals as columns */}
                        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${ltGoal.children.length}, 1fr)` }}>
                          {ltGoal.children.map((mtGoal) => {
                            const hasSTChildren = mtGoal.children && mtGoal.children.length > 0;
                            const mtReview = goalReviews[mtGoal.id];
                            
                            return (
                              <div key={mtGoal.id} className="space-y-3">
                                {/* Medium-term goal card */}
                                <div 
                                  onClick={() => onCardClick(mtGoal)}
                                  className="border border-slate-300 rounded-lg p-3 bg-slate-50 hover:bg-slate-100 cursor-pointer"
                                >
                                  <h5 className="font-semibold text-slate-800 mb-1 text-sm">
                                    {mtGoal.title || mtGoal.goal_text}
                                  </h5>
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="text-slate-600">Medium-term</span>
                                    {taskCounts[mtGoal.id] > 0 && (
                                      <span className="text-blue-600">
                                        {taskCounts[mtGoal.id]} task{taskCounts[mtGoal.id] !== 1 ? 's' : ''}
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* THIS medium-term goal's review */}
                                  {mtReview && (
                                    <div className="mt-2 pt-2 border-t border-slate-200">
                                      <p className="text-xs text-slate-600">
                                        Last reviewed: {new Date(mtReview.session_ended_at).toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: 'numeric'
                                        })}
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* Short-term goals under this medium-term goal */}
                                {hasSTChildren && (
                                  <div className="space-y-2 pl-3 border-l-2 border-slate-200">
                                    {mtGoal.children.map((stGoal) => {
                                      const stReview = goalReviews[stGoal.id];
                                      return (
                                        <div key={stGoal.id}>
                                          <div
                                            onClick={() => onCardClick(stGoal)}
                                            className="border border-slate-200 rounded p-2 bg-white hover:bg-slate-50 cursor-pointer"
                                          >
                                            <h6 className="font-medium text-slate-700 text-xs mb-0.5">
                                              {stGoal.title || stGoal.goal_text}
                                            </h6>
                                            <div className="flex items-center gap-2 text-[10px]">
                                              <span className="text-slate-500">Short-term</span>
                                              {taskCounts[stGoal.id] > 0 && (
                                                <span className="text-blue-600">
                                                  {taskCounts[stGoal.id]} task{taskCounts[stGoal.id] !== 1 ? 's' : ''}
                                                </span>
                                              )}
                                            </div>
                                            
                                            {/* THIS short-term goal's review */}
                                            {stReview && (
                                              <p className="text-[10px] text-slate-600 mt-1">
                                                Reviewed: {new Date(stReview.session_ended_at).toLocaleDateString('en-US', { 
                                                  month: 'short', 
                                                  day: 'numeric'
                                                })}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
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
        <div className="text-center py-12 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="text-5xl mb-4">💬</div>
          <h3 className="text-base font-semibold text-slate-700 mb-2">
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
