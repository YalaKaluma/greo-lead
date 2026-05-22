-- Journey 2.0 correction:
-- target_belt now stores the belt whose trials the user is working on.
-- Earlier builds stored the belt the user was trying to earn, so shift existing
-- rows down one belt to preserve user submissions.

DELETE FROM journey_belt_trials old_rows
USING journey_belt_trials current_rows
WHERE old_rows.target_belt IN ('yellow', 'green', 'brown', 'black')
  AND current_rows.user_number = old_rows.user_number
  AND current_rows.dimension_id = old_rows.dimension_id
  AND current_rows.trial_type = old_rows.trial_type
  AND current_rows.target_belt = CASE old_rows.target_belt
      WHEN 'yellow' THEN 'white'
      WHEN 'green' THEN 'yellow'
      WHEN 'brown' THEN 'green'
      WHEN 'black' THEN 'brown'
      ELSE old_rows.target_belt
  END;

UPDATE journey_belt_trials
SET target_belt = CASE target_belt
    WHEN 'yellow' THEN 'white'
    WHEN 'green' THEN 'yellow'
    WHEN 'brown' THEN 'green'
    WHEN 'black' THEN 'brown'
    ELSE target_belt
END
WHERE target_belt IN ('yellow', 'green', 'brown', 'black');
