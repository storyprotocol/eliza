BEGIN;

-- Disable triggers temporarily to avoid foreign key issues
SET session_replication_role = 'replica';

-- Truncate all tables in the correct order (reverse of creation order)
TRUNCATE TABLE conversation_logs CASCADE;
TRUNCATE TABLE contestant_scores CASCADE;
TRUNCATE TABLE cache CASCADE;
TRUNCATE TABLE relationships CASCADE;
TRUNCATE TABLE participants CASCADE;
TRUNCATE TABLE logs CASCADE;
TRUNCATE TABLE goals CASCADE;
TRUNCATE TABLE memories CASCADE;
TRUNCATE TABLE rooms CASCADE;
TRUNCATE TABLE accounts CASCADE;

-- Re-enable triggers
SET session_replication_role = 'origin';

COMMIT;
