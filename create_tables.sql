CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
