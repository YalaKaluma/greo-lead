BEGIN;

UPDATE journey_goals goal
SET time_horizon = backup.time_horizon,
updated_at = now()
FROM journey_goals_goal_level_backup_20260523 backup
WHERE goal.id = backup.id;

COMMIT;

