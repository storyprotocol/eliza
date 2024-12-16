import express, { Router, Request, Response } from "express";
import { PostgresDatabaseAdapter } from "@ai16z/adapter-postgres";
import { elizaLogger } from "@ai16z/eliza";
import { v5 as uuidv5 } from "uuid";

const router = Router();

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

interface AgentData {
  name: string;
  score: number;
  profile: any;
  messages: any[];
  questions: Set<string> | string[];
}

const NAMESPACE_UUID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const userSessions = new Map<
  string,
  {
    uuidUserId: string;
    roomId: string;
    lastInteraction: Date;
  }
>();

router.post("/game/duration", async (req: any, res: any) => {
  const { startTimestamp, endTimestamp, messagingIntervalSeconds } = req.body;

  if (!startTimestamp || !endTimestamp) {
    return res.status(400).json({
      status: "error",
      message: "startTimestamp and endTimestamp are required"
    });
  }

  const db = new PostgresDatabaseAdapter({
    connectionString: process.env.POSTGRES_URL,
    parseInputs: true,
  });

  try {
    await db.query(
      `INSERT INTO game_config ("id", "messagingIntervalSeconds", "startTimestamp", "endTimestamp")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
       SET
       "id" = $1,
       "messagingIntervalSeconds" = $2,
       "startTimestamp" = $3,
        "endTimestamp" = $4`,
      [process.env.GAME_CONFIG_ID, messagingIntervalSeconds, startTimestamp, endTimestamp]
    );

    res.json({ status: "success" });
  } catch (error) {
    elizaLogger.error("Error inserting game config:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to save game configuration"
    });
  }
});

router.post("/game/restart", async (req: any, res: any) => {
  const { id } = req.body;
  try {
    const db = new PostgresDatabaseAdapter({
      connectionString: process.env.POSTGRES_URL,
      parseInputs: true,
    });

    await db.query(`TRUNCATE TABLE conversation_logs CASCADE`);
    await db.query(`TRUNCATE TABLE contestant_scores CASCADE`);
    await db.query(`TRUNCATE TABLE memories CASCADE`);
    await db.query(`TRUNCATE TABLE relationships CASCADE`);
    await db.query(`TRUNCATE TABLE participants CASCADE`);

  } catch (error) {
    elizaLogger.error("Error clearing game data:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to clear game data"
    });
  }


  res.json({ status: "success" });
});

router.get("/chat-data", async (req: any, res: any) => {
  try {
    const { startTime, agentName } = req.query;
    const endTime = new Date().toISOString();

    if (!startTime) {
      return res.status(400).json({
        status: "error",
        message: "startTime parameter is required",
      });
    }

    const db = new PostgresDatabaseAdapter({
      connectionString: process.env.POSTGRES_URL,
      parseInputs: true,
    });

    // read game config
    const gameConfig = await db.query(`SELECT * FROM game_config WHERE id = $1`, [process.env.GAME_CONFIG_ID]);
    if (gameConfig.rows.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Game configuration not found",
      });
    }

    const query = `
SELECT
    cs."agentId",
    cs.score as cumulative_score,
    cl."contestantMessage",
    cl."marilynResponse",
    cl."contestantMessageTime",
    cl."marilynResponseTime",
    cl."interactionScore",
    cl."question",
    a.name,
    a.username,
    a."avatarUrl",
    a.details,
    a."ipId",
    a."walletAddress",
    a."walletPublicKey",
    a."walletPrivateKey",
    a."licenseTermId",
    a."licenseTermUri",
    a."ipRegistrationTxnHash",
    a."character"
FROM contestant_scores cs
LEFT JOIN conversation_logs cl ON cs."agentId" = cl."agentId"
LEFT JOIN accounts a ON cs."agentId"::text = a.id::text
WHERE cl."contestantMessageTime" >= $1
AND cl."contestantMessageTime" <= $2
${agentName ? "AND a.name = $3" : ""}
ORDER BY cs."agentId", cl."contestantMessageTime" ASC
`;

    const params = agentName
      ? [startTime, endTime, agentName]
      : [startTime, endTime];
    const result = await db.query(query, params);

    const agents = result.rows.reduce((acc, row) => {
      const agentId = row.agentId;
      if (!acc[agentId]) {
        acc[agentId] = {
          name: row.username || row.name || agentId,
          score: row.cumulative_score || 0,
          profile: {
            name: row.name || agentId,
            picture_url: row.avatarUrl || `https://example.com/${agentId}.jpg`,
            description:
              row.details?.description || `Contestant ${row.name || agentId}`,
            ipId: row.ipId || null,
            walletAddress: row.walletAddress || null,
            licenseTermId: row.licenseTermId || null,
            licenseTermUri: row.licenseTermUri || null,
            ipRegistrationTxnHash: row.ipRegistrationTxnHash || null,
            character: row.character || null,
          },
          messages: [],
          questions: new Set(),
        };
      }

      if (row.contestantMessage) {
        if (row.question) {
          acc[agentId].questions.add(row.question);
        }

        acc[agentId].messages.push({
          name: row.username || row.name || agentId,
          content: row.contestantMessage,
          created_at: row.contestantMessageTime,
          question: row.question,
          score: row.interactionScore,
        });

        if (row.marilynResponse) {
          acc[agentId].messages.push({
            name: "marilyn",
            content: row.marilynResponse,
            created_at: row.marilynResponseTime,
            question: row.question,
          });
        }
      }

      return acc;
    }, {});

    const agentsWithArrayQuestions = Object.entries(agents).reduce(
      (
        acc: { [key: string]: AgentData },
        [key, value]: [string, AgentData]
      ) => {
        acc[key] = {
          ...(value as AgentData),
          questions: Array.from(value.questions as Set<string>),
        };
        return acc;
      },
      {}
    );

    res.json({
      status: "success",
      data: {
        agents: Object.values(agentsWithArrayQuestions),
        messagingIntervalSeconds: gameConfig.rows[0].messagingIntervalSeconds,
        contestStartTimestamp: gameConfig.rows[0].startTimestamp,
        contestEndTimestamp: gameConfig.rows[0].endTimestamp,
      },
    });
  } catch (error) {
    console.error("Error fetching chat data:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch chat data",
    });
  }
});

router.post("/chat-with-marilyn", async (req: any, res: any) => {
  try {
    // Validate request body
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        status: "error",
        message: "Invalid request body",
        received: req.body,
      });
    }
    const { message, userId, userName } = req.body;
    elizaLogger.info("Received request body:", req.body);

    if (!message || !userId) {
      return res.status(400).json({
        status: "error",
        message: "message and userId are required",
      });
    }

    let session = userSessions.get(userId);
    if (!session) {
      const uuidUserId = uuidv5(`user-${userId}-${Date.now()}`, NAMESPACE_UUID);
      const roomId = uuidv5(`room-${uuidUserId}-${Date.now()}`, NAMESPACE_UUID);

      session = {
        uuidUserId,
        roomId,
        lastInteraction: new Date(),
      };
      userSessions.set(userId, session);

      elizaLogger.info(`New user session created:`, {
        originalUserId: userId,
        uuidUserId,
        roomId,
      });
    } else {
      // Update last interaction time
      session.lastInteraction = new Date();
      elizaLogger.info(`Using existing session for user:`, {
        originalUserId: userId,
        uuidUserId: session.uuidUserId,
        roomId: session.roomId,
      });
    }

    const db = new PostgresDatabaseAdapter({
      connectionString: process.env.POSTGRES_URL,
      parseInputs: true,
    });

    //  add the user to the accounts table
    await db.query(
      `INSERT INTO accounts (
            "id",
            "name",
            "username",
            "email",
            "createdAt"
        ) VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT ("id") DO UPDATE
        SET "createdAt" = NOW()`,
      [session.uuidUserId, userName || userId, userId, `${userId}@example.com`]
    );

    const insertResult = await db.query(
      `INSERT INTO conversation_logs (
            "agentId",
            "contestantMessage",
            "contestantMessageTime",
            "roomId"
        ) VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
        RETURNING *`,
      [session.uuidUserId, message, session.roomId]
    );

    elizaLogger.info("Saved user message:", insertResult.rows[0]);
    const serverPort = parseInt(process.env.SERVER_PORT || "3000");
    const marilynResponse = await fetch(
      `http://localhost:${serverPort}/${process.env.MARILYN_AGENT_ID}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message,
          userId: session.uuidUserId,
          userName: userName || "External User",
          roomId: session.roomId,
        }),
      }
    );

    const responseData = await marilynResponse.json();

    if (!marilynResponse.ok) {
      throw new Error(
        `Failed to get Marilyn's response: ${marilynResponse.statusText}`
      );
    }
    if (responseData.length > 0) {
      const lastMessage = responseData[responseData.length - 1];

      // Update the conversation log with Marilyn's response and score
      await db.query(
        `WITH latest_message AS (
            SELECT id
            FROM conversation_logs
            WHERE "agentId" = $1
            AND "marilynResponse" IS NULL
            ORDER BY "contestantMessageTime" DESC
            LIMIT 1
        )
        UPDATE conversation_logs
        SET "marilynResponse" = $2,
            "marilynResponseTime" = CURRENT_TIMESTAMP,
            "interactionScore" = $3
        FROM latest_message
        WHERE conversation_logs.id = latest_message.id
        RETURNING *`,
        [session.uuidUserId, lastMessage.text, lastMessage.score || 0]
      );
      await db.query(
        `INSERT INTO contestant_scores ("agentId", "score")
        VALUES ($1, $2)
        ON CONFLICT ("agentId") DO UPDATE
        SET "score" = contestant_scores.score + EXCLUDED.score`,
        [session.uuidUserId, lastMessage.score || 0]
      );

      elizaLogger.info(`External chat - User ${userId}: ${message}`);
      elizaLogger.info(`External chat - Marilyn: ${lastMessage.text}`);
      return res.json({
        status: "success",
        data: {
          message: lastMessage.text,
          score: lastMessage.score || 0,
          sessionInfo: {
            userId: session.uuidUserId,
            roomId: session.roomId,
            originalUserId: userId,
          },
        },
      });
    }

    res.status(500).json({
      status: "error",
      message: "Failed to get response from Marilyn",
    });
  } catch (error) {
    console.error("Error in chat with Marilyn:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to process chat",
    });
  }
});

export default router;
