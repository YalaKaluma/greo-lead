BEGIN;

CREATE TABLE IF NOT EXISTS journey_goals_goal_level_backup_20260523 (
    id INTEGER PRIMARY KEY,
    user_number VARCHAR,
    time_horizon VARCHAR,
    parent_goal_id INTEGER,
    sort_order INTEGER,
    first_seen_at TIMESTAMP,
    updated_at TIMESTAMP,
    backed_up_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

INSERT INTO journey_goals_goal_level_backup_20260523 (
    id,
    user_number,
    time_horizon,
    parent_goal_id,
    sort_order,
    first_seen_at,
    updated_at,
    backed_up_at
)
SELECT
    id,
    user_number,
    time_horizon,
    parent_goal_id,
    sort_order,
    first_seen_at,
    updated_at,
    now() AS backed_up_at
FROM journey_goals
WHERE time_horizon IN ('long', 'medium', 'short', 'long_term', 'medium_term', 'short_term')
ON CONFLICT (id) DO NOTHING;

UPDATE journey_goals
SET time_horizon = CASE time_horizon
    WHEN 'long' THEN 'vision'
    WHEN 'long_term' THEN 'vision'
    WHEN 'medium' THEN 'pillar'
    WHEN 'medium_term' THEN 'pillar'
    WHEN 'short' THEN 'outcome'
    WHEN 'short_term' THEN 'outcome'
    ELSE time_horizon
END,
updated_at = now()
WHERE time_horizon IN ('long', 'medium', 'short', 'long_term', 'medium_term', 'short_term');

DO $$
DECLARE
    old_visions integer;
    old_pillars integer;
    old_outcomes integer;
    new_visions integer;
    new_pillars integer;
    new_outcomes integer;
BEGIN
    SELECT count(*) INTO old_visions FROM journey_goals_goal_level_backup_20260523 WHERE time_horizon IN ('long', 'long_term');
    SELECT count(*) INTO old_pillars FROM journey_goals_goal_level_backup_20260523 WHERE time_horizon IN ('medium', 'medium_term');
    SELECT count(*) INTO old_outcomes FROM journey_goals_goal_level_backup_20260523 WHERE time_horizon IN ('short', 'short_term');

    SELECT count(*) INTO new_visions
    FROM journey_goals goal
    JOIN journey_goals_goal_level_backup_20260523 backup ON backup.id = goal.id
    WHERE backup.time_horizon IN ('long', 'long_term')
      AND goal.time_horizon = 'vision';

    SELECT count(*) INTO new_pillars
    FROM journey_goals goal
    JOIN journey_goals_goal_level_backup_20260523 backup ON backup.id = goal.id
    WHERE backup.time_horizon IN ('medium', 'medium_term')
      AND goal.time_horizon = 'pillar';

    SELECT count(*) INTO new_outcomes
    FROM journey_goals goal
    JOIN journey_goals_goal_level_backup_20260523 backup ON backup.id = goal.id
    WHERE backup.time_horizon IN ('short', 'short_term')
      AND goal.time_horizon = 'outcome';

    IF old_visions <> new_visions OR old_pillars <> new_pillars OR old_outcomes <> new_outcomes THEN
        RAISE EXCEPTION 'Goal level migration validation failed. old=(%, %, %) new=(%, %, %)',
            old_visions, old_pillars, old_outcomes, new_visions, new_pillars, new_outcomes;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM journey_goals child
        LEFT JOIN journey_goals parent ON parent.id = child.parent_goal_id
        WHERE child.parent_goal_id IS NOT NULL
          AND parent.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Goal level migration validation failed: orphaned goals found';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM tasks task
        LEFT JOIN journey_goals goal ON goal.id = task.goal_id
        WHERE task.goal_id IS NOT NULL
          AND goal.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Goal level migration validation failed: orphaned task-goal links found';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM habits habit
        LEFT JOIN journey_goals goal ON goal.id = habit.goal_id
        WHERE habit.goal_id IS NOT NULL
          AND goal.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Goal level migration validation failed: orphaned habit-goal links found';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM goal_review_sessions review
        LEFT JOIN journey_goals goal ON goal.id = review.goal_id
        WHERE goal.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Goal level migration validation failed: orphaned progress review links found';
    END IF;
END $$;

COMMIT;
