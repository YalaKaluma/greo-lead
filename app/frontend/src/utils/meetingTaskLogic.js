const timestamp = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizedMtnScore = (task) => {
  if (task.mtn_score === null || task.mtn_score === undefined) return -1;
  const score = Number(task.mtn_score);
  return Number.isNaN(score) ? -1 : score;
};

export const sortMeetingTasks = (tasks, mtnDirection = 'desc') => [...tasks].sort((left, right) => {
  const meetingDateDifference = timestamp(right.meeting_started_at) - timestamp(left.meeting_started_at);
  if (meetingDateDifference !== 0) return meetingDateDifference;

  if (left.meeting_id !== right.meeting_id) {
    return Number(right.meeting_id || 0) - Number(left.meeting_id || 0);
  }

  const scoreDifference = normalizedMtnScore(right) - normalizedMtnScore(left);
  if (scoreDifference !== 0) return mtnDirection === 'asc' ? -scoreDifference : scoreDifference;

  return timestamp(right.created_at) - timestamp(left.created_at);
});
