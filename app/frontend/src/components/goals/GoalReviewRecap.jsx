import GoalCard from './GoalCard';

/* =========================================================
   PROGRESS REVIEW
   When expanded: Goal tree first, then reviews underneath
   ========================================================= */

export default function GoalReviewRecap({ 
  goals, 
  reviewSessions,
  expandedGoalId, 
  onCardClick, 
  taskCounts 
}) {
  
  // Build map of goal_id -> ALL review sessions for that goal (sorted by date)
  const reviewsByGoal = {};
  reviewSessions.forEach(session => {
    if (!reviewsByGoal[session.goal_id]) {
      reviewsByGoal[session.goal_id] = [];
    }
    reviewsByGoal[session.goal_id].push(session);
  });

  // Get the most recent overall review (for collapsed view)
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
      {/* Show latest review ONLY when no goal is expanded */}
      {!expandedGoalId && latestReview && (
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

          <div className="mb-4">
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Session Summary
            </h4>
            <p className="text-slate-700 leading-relaxed">
              {latestReview.summary}
            </p>
          </div>

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

      {/* Goals Tree */}
      <div className="space-y-4">
        {tree.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500">No goals yet</p>
          </div>
        ) : (
          tree.map(ltGoal => {
            const isExpanded = expandedGoalId === ltGoal.id;
            const hasChildren = ltGoal.children && ltGoal.children.length > 0;
            const goalReviews = reviewsByGoal[ltGoal.id] || [];  // ALL reviews for this goal
            const latestGoalReview = goalReviews.length > 0 ? goalReviews[0] : null;
            
            if (expandedGoalId && expandedGoalId !== ltGoal.id) {
              return null;
            }
            
            return (
              <div key={ltGoal.id} className="space-y-6">
                {!isExpanded ? (
                  /* Collapsed view */
                  <div>
                    <GoalCard 
                      goal={ltGoal}
                      onClick={onCardClick}
                      taskCount={taskCounts[ltGoal.id] || 0}
                      isInTree={false}
                    />
                    {latestGoalReview && (
                      <div className="mt-2 ml-4 p-3 bg-slate-50 border-l-4 border-slate-400 rounded text-sm">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-medium text-slate-700">Last reviewed:</span>
                          <span className="text-slate-600">
                            {new Date(latestGoalReview.session_ended_at).toLocaleDateString('en-US', { 
                              month: 'numeric', 
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                        <p className="text-slate-600 line-clamp-2">{latestGoalReview.summary}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* EXPANDED VIEW - Goal tree FIRST, reviews UNDERNEATH */
                  <>
                    {/* Goal breakdown card */}
                    <div className="border border-slate-300 rounded-lg p-5 bg-white">
                      {/* Long-term goal header */}
                      <div className="mb-5">
                        <div className="border-2 border-blue-400 rounded-lg p-4 bg-blue-50/30">
                          <h3 className="text-xl font-bold text-slate-900 mb-1">
                            {ltGoal.title || ltGoal.goal_text}
                          </h3>
                          <div className="flex items-center gap-3 text-sm text-slate-600">
                            <span>Long Term</span>
                            {taskCounts[ltGoal.id] > 0 && (
                              <span className="text-blue-600 font-medium">
                                • {taskCounts[ltGoal.id]} task{taskCounts[ltGoal.id] !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Breakdown section */}
                      {hasChildren && (
                        <div>
                          <h4 className="text-sm font-medium text-slate-600 mb-4">
                            How this goal breaks down
                          </h4>
                          
                          {/* Medium-term goals in columns */}
                          <div 
                            className="grid gap-4"
                            style={{ 
                              gridTemplateColumns: `repeat(${Math.min(ltGoal.children.length, 3)}, 1fr)` 
                            }}
                          >
                            {ltGoal.children.map((mtGoal) => {
                              const hasSTChildren = mtGoal.children && mtGoal.children.length > 0;
                              
                              return (
                                <div key={mtGoal.id} className="flex flex-col gap-3">
                                  {/* Medium-term goal card */}
                                  <div 
                                    onClick={() => onCardClick(mtGoal)}
                                    className="border border-slate-300 rounded-lg p-4 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
                                  >
                                    <h5 className="font-semibold text-slate-900 mb-2 text-base leading-tight">
                                      {mtGoal.title || mtGoal.goal_text}
                                    </h5>
                                    <div className="text-xs text-slate-600 space-y-1">
                                      <div>Medium Term</div>
                                      {taskCounts[mtGoal.id] > 0 && (
                                        <div className="text-blue-600 font-medium">
                                          {taskCounts[mtGoal.id]} task{taskCounts[mtGoal.id] !== 1 ? 's' : ''}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Short-term goals list */}
                                  {hasSTChildren && (
                                    <div className="space-y-2">
                                      <div className="text-xs font-medium text-slate-500 uppercase tracking-wider pl-3">
                                        Short-Term Goals
                                      </div>
                                      {mtGoal.children.map((stGoal) => (
                                        <div
                                          key={stGoal.id}
                                          onClick={() => onCardClick(stGoal)}
                                          className="border border-slate-200 rounded-lg p-3 bg-white hover:bg-slate-50 cursor-pointer transition-colors ml-3"
                                        >
                                          <h6 className="font-medium text-slate-800 text-sm mb-1 leading-tight">
                                            {stGoal.title || stGoal.goal_text}
                                          </h6>
                                          <div className="text-xs text-slate-500">
                                            Short Term
                                            {taskCounts[stGoal.id] > 0 && (
                                              <span className="text-blue-600 ml-2">
                                                • {taskCounts[stGoal.id]} task{taskCounts[stGoal.id] !== 1 ? 's' : ''}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Review Sessions - ALL sessions for THIS goal */}
                    {goalReviews.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-slate-800">
                          Coaching Sessions ({goalReviews.length})
                        </h3>

                        {goalReviews.map((review, index) => (
                          <div 
                            key={review.id}
                            className="bg-slate-50 border border-slate-200 rounded-lg p-5"
                          >
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <h4 className="text-base font-semibold text-slate-800 mb-1">
                                  {index === 0 ? 'Latest Session' : `Session ${goalReviews.length - index}`}
                                </h4>
                                <p className="text-sm text-slate-600">
                                  {new Date(review.session_ended_at).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </p>
                              </div>
                            </div>

                            <div className="mb-4">
                              <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                                Session Summary
                              </h5>
                              <p className="text-slate-700 leading-relaxed">
                                {review.summary}
                              </p>
                            </div>

                            {(review.key_progress || review.key_blockers || review.chosen_adjustment) && (
                              <div className="grid md:grid-cols-3 gap-3">
                                {review.key_progress && (
                                  <div className="bg-white border border-slate-200 rounded p-3">
                                    <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
                                      Progress
                                    </div>
                                    <p className="text-sm text-slate-700">{review.key_progress}</p>
                                  </div>
                                )}

                                {review.key_blockers && (
                                  <div className="bg-white border border-slate-200 rounded p-3">
                                    <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
                                      Blockers
                                    </div>
                                    <p className="text-sm text-slate-700">{review.key_blockers}</p>
                                  </div>
                                )}

                                {review.chosen_adjustment && (
                                  <div className="bg-white border border-slate-200 rounded p-3">
                                    <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
                                      Actions Agreed
                                    </div>
                                    <p className="text-sm text-slate-700">{review.chosen_adjustment}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* No reviews state for this goal */}
                    {goalReviews.length === 0 && (
                      <div className="text-center py-8 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-sm text-slate-600">
                          No coaching sessions yet for this goal
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Empty state */}
      {reviewSessions.length === 0 && !expandedGoalId && (
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
