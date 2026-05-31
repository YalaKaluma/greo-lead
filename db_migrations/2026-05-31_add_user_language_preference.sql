ALTER TABLE users
ADD COLUMN IF NOT EXISTS language_preference VARCHAR(10) DEFAULT 'en';

UPDATE users
SET language_preference = 'en'
WHERE language_preference IS NULL;
