ALTER TABLE messages
ADD COLUMN IF NOT EXISTS conversation_type VARCHAR DEFAULT 'messages';

UPDATE messages
SET conversation_type = CASE
    WHEN message_type = 'journal' THEN 'journal'
    WHEN message_type IN ('goal_coaching', 'goal_review') THEN 'goal_coaching'
    WHEN message_type = 'leadership_coaching' THEN 'leadership_coaching'
    WHEN message_type IN ('team_coaching', 'people_review') THEN 'team_coaching'
    WHEN message_type IN ('nudge', 'notification') THEN 'messages'
    ELSE COALESCE(conversation_type, 'messages')
END
WHERE conversation_type IS NULL
   OR conversation_type = 'messages';

CREATE INDEX IF NOT EXISTS idx_messages_conversation_type
ON messages (conversation_type);
