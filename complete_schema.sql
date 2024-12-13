DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
        CREATE EXTENSION "uuid-ossp";
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        CREATE EXTENSION vector;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'fuzzystrmatch') THEN
        CREATE EXTENSION fuzzystrmatch;
    END IF;
END
$$;

-- Create a function to determine vector dimension
CREATE OR REPLACE FUNCTION get_embedding_dimension()
RETURNS INTEGER AS $$
BEGIN
    IF current_setting('app.use_openai_embedding', TRUE) = 'true' THEN
        RETURN 1536;
    ELSIF current_setting('app.use_ollama_embedding', TRUE) = 'true' THEN
        RETURN 1024;
    ELSE
        RETURN 384;
    END IF;
END;
$$ LANGUAGE plpgsql;

BEGIN;

CREATE TABLE IF NOT EXISTS accounts (
    "id" UUID PRIMARY KEY,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "username" TEXT,
    "email" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "details" JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS rooms (
    "id" UUID PRIMARY KEY,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memories (
    "id" UUID PRIMARY KEY,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "content" JSONB NOT NULL,
    "embedding" vector(1536),
    "userId" UUID REFERENCES accounts("id"),
    "agentId" UUID REFERENCES accounts("id"),
    "roomId" UUID REFERENCES rooms("id"),
    "unique" BOOLEAN DEFAULT true NOT NULL,
    CONSTRAINT fk_room FOREIGN KEY ("roomId") REFERENCES rooms("id") ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY ("userId") REFERENCES accounts("id") ON DELETE CASCADE,
    CONSTRAINT fk_agent FOREIGN KEY ("agentId") REFERENCES accounts("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS goals (
    "id" UUID PRIMARY KEY,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID REFERENCES accounts("id"),
    "name" TEXT,
    "status" TEXT,
    "description" TEXT,
    "roomId" UUID REFERENCES rooms("id"),
    "objectives" JSONB DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT fk_room FOREIGN KEY ("roomId") REFERENCES rooms("id") ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY ("userId") REFERENCES accounts("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS logs (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL REFERENCES accounts("id"),
    "body" JSONB NOT NULL,
    "type" TEXT NOT NULL,
    "roomId" UUID NOT NULL REFERENCES rooms("id"),
    CONSTRAINT fk_room FOREIGN KEY ("roomId") REFERENCES rooms("id") ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY ("userId") REFERENCES accounts("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS participants (
    "id" UUID PRIMARY KEY,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID REFERENCES accounts("id"),
    "roomId" UUID REFERENCES rooms("id"),
    "userState" TEXT,
    "last_message_read" TEXT,
    UNIQUE("userId", "roomId"),
    CONSTRAINT fk_room FOREIGN KEY ("roomId") REFERENCES rooms("id") ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY ("userId") REFERENCES accounts("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS relationships (
    "id" UUID PRIMARY KEY,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "userA" UUID NOT NULL REFERENCES accounts("id"),
    "userB" UUID NOT NULL REFERENCES accounts("id"),
    "status" TEXT,
    "userId" UUID NOT NULL REFERENCES accounts("id"),
    CONSTRAINT fk_user_a FOREIGN KEY ("userA") REFERENCES accounts("id") ON DELETE CASCADE,
    CONSTRAINT fk_user_b FOREIGN KEY ("userB") REFERENCES accounts("id") ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY ("userId") REFERENCES accounts("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cache (
    "key" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "value" JSONB DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP,
    PRIMARY KEY ("key", "agentId")
);

CREATE TABLE IF NOT EXISTS contestant_scores (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "agentId" UUID NOT NULL REFERENCES accounts("id"),
    "score" NUMERIC DEFAULT 0,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_contestant FOREIGN KEY ("agentId")
        REFERENCES accounts("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_logs (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "agentId" UUID NOT NULL REFERENCES accounts("id"),
    "contestantMessage" TEXT NOT NULL,
    "contestantMessageTime" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "marilynResponse" TEXT NOT NULL,
    "marilynResponseTime" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "marilynThoughts" TEXT,
    "metadata" JSONB,
    "interactionScore" NUMERIC DEFAULT 0,
    CONSTRAINT check_score_range CHECK ("interactionScore" BETWEEN -1 AND 1),
    "roomId" UUID,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_contestant FOREIGN KEY ("agentId")
        REFERENCES accounts("id") ON DELETE CASCADE,
    CONSTRAINT idx_contestant_time
        UNIQUE ("agentId", "contestantMessageTime")
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_memories_type_room ON memories("type", "roomId");
CREATE INDEX IF NOT EXISTS idx_participants_user ON participants("userId");
CREATE INDEX IF NOT EXISTS idx_participants_room ON participants("roomId");
CREATE INDEX IF NOT EXISTS idx_relationships_users ON relationships("userA", "userB");
CREATE INDEX IF NOT EXISTS idx_contestant_scores_contestant
    ON contestant_scores("agentId");

COMMIT;
