import { Router } from "express";
import { PostgresDatabaseAdapter } from "@ai16z/adapter-postgres";

const router = Router();

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

    const query = `
          WITH filtered_messages AS (
              SELECT *
              FROM conversation_logs
              WHERE "contestantMessageTime" >= $1
              AND "contestantMessageTime" <= $2
              ${
                agentName
                  ? 'AND "agentId" IN (SELECT id FROM accounts WHERE name = $3)'
                  : ""
              }
          )
          SELECT DISTINCT ON (cs."agentId")
              cs."agentId",
              cs.score as cumulative_score,
              cl."contestantMessage",
              cl."marilynResponse",
              cl."contestantMessageTime",
              cl."marilynResponseTime",
              cl."interactionScore",
              a.name,
              a.username,
              a."avatarUrl",
              a.details
          FROM contestant_scores cs
          LEFT JOIN filtered_messages cl ON cs."agentId" = cl."agentId"
          LEFT JOIN accounts a ON cs."agentId"::text = a.id::text
          ${agentName ? "WHERE a.name = $3" : ""}
          ORDER BY cs."agentId", cl."contestantMessageTime" DESC
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
          },
          messages: [],
        };
      }

      if (row.contestantMessage) {
        acc[agentId].messages.push({
          name: row.username || row.name || agentId,
          content: row.contestantMessage,
          created_at: row.contestantMessageTime,
        });

        if (row.marilynResponse) {
          acc[agentId].messages.push({
            name: "marilyn",
            content: row.marilynResponse,
            created_at: row.marilynResponseTime,
          });
        }
      }

      return acc;
    }, {});

    res.json({
      status: "success",
      data: {
        agents: Object.values(agents),
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

export default router;
