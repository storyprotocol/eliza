import { PostgresDatabaseAdapter } from "@ai16z/adapter-postgres";
import { SqliteDatabaseAdapter } from "@ai16z/adapter-sqlite";
import { AutoClientInterface } from "@ai16z/client-auto";
import { DirectClientInterface } from "@ai16z/client-direct";
import { DiscordClientInterface } from "@ai16z/client-discord";
import { TelegramClientInterface } from "@ai16z/client-telegram";
import { TwitterClientInterface } from "@ai16z/client-twitter";
import { FarcasterAgentClient } from "@ai16z/client-farcaster";
import {
  AgentRuntime,
  CacheManager,
  Character,
  Clients,
  Content,
  DbCacheAdapter,
  FsCacheAdapter,
  IAgentRuntime,
  ICacheManager,
  IDatabaseAdapter,
  IDatabaseCacheAdapter,
  ModelProviderName,
  defaultCharacter,
  elizaLogger,
  settings,
  stringToUuid,
  validateCharacterConfig,
} from "@ai16z/eliza";
import { zgPlugin } from "@ai16z/plugin-0g";
import { goatPlugin } from "@ai16z/plugin-goat";
import { bootstrapPlugin } from "@ai16z/plugin-bootstrap";
// import { buttplugPlugin } from "@ai16z/plugin-buttplug";
import {
  coinbaseCommercePlugin,
  coinbaseMassPaymentsPlugin,
  tradePlugin,
  tokenContractPlugin,
  webhookPlugin,
  advancedTradePlugin,
} from "@ai16z/plugin-coinbase";
import { confluxPlugin } from "@ai16z/plugin-conflux";
import { imageGenerationPlugin } from "@ai16z/plugin-image-generation";
import { evmPlugin } from "@ai16z/plugin-evm";
import { createNodePlugin } from "@ai16z/plugin-node";
import { solanaPlugin } from "@ai16z/plugin-solana";
import { aptosPlugin, TransferAptosToken } from "@ai16z/plugin-aptos";
import { flowPlugin } from "@ai16z/plugin-flow";
import { storyPlugin } from "@ai16z/plugin-story";
import { teePlugin } from "@ai16z/plugin-tee";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import yargs from "yargs";
import express from "express";
import apiRouter from "./api";
import cors from "cors";

import { mainCharacter } from "../maincharacter";

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
  const waitTime =
    Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
  return new Promise((resolve) => setTimeout(resolve, waitTime));
};

export function parseArguments(): {
  marilyn?: string;
  character?: string;
  characters?: string;
} {
  try {
    return yargs(process.argv.slice(3))
      .option("character", {
        type: "string",
        description: "Path to the character JSON file",
      })
      .option("marilyn", {
        type: "string",
        description: "Path to the Marilyn character JSON file",
      })
      .option("characters", {
        type: "string",
        description: "Comma separated list of paths to character JSON files",
      })
      .parseSync();
  } catch (error) {
    elizaLogger.error("Error parsing arguments:", error);
    return {};
  }
}

function tryLoadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (e) {
    return null;
  }
}

function isAllStrings(arr: unknown[]): boolean {
  return Array.isArray(arr) && arr.every((item) => typeof item === "string");
}

export async function loadCharacters(
  charactersArg: string
): Promise<Character[]> {
  let characterPaths = charactersArg
    ?.split(",")
    .map((filePath) => filePath.trim());
  const loadedCharacters = [];

  if (characterPaths?.length > 0) {
    for (const characterPath of characterPaths) {
      let content = null;
      let resolvedPath = "";

      // Try different path resolutions in order
      const pathsToTry = [
        characterPath, // exact path as specified
        path.resolve(process.cwd(), characterPath), // relative to cwd
        path.resolve(process.cwd(), "agent", characterPath), // Add this
        path.resolve(__dirname, characterPath), // relative to current script
        path.resolve(__dirname, "characters", path.basename(characterPath)), // relative to agent/characters
        path.resolve(__dirname, "../characters", path.basename(characterPath)), // relative to characters dir from agent
        path.resolve(
          __dirname,
          "../../characters",
          path.basename(characterPath)
        ), // relative to project root characters dir
      ];

      elizaLogger.info(
        "Trying paths:",
        pathsToTry.map((p) => ({
          path: p,
          exists: fs.existsSync(p),
        }))
      );

      for (const tryPath of pathsToTry) {
        content = tryLoadFile(tryPath);
        if (content !== null) {
          resolvedPath = tryPath;
          break;
        }
      }

      if (content === null) {
        elizaLogger.error(
          `Error loading character from ${characterPath}: File not found in any of the expected locations`
        );
        elizaLogger.error("Tried the following paths:");
        pathsToTry.forEach((p) => elizaLogger.error(` - ${p}`));
        process.exit(1);
      }

      try {
        const character = JSON.parse(content);
        validateCharacterConfig(character);

        // Handle plugins
        if (isAllStrings(character.plugins)) {
          elizaLogger.info("Plugins are: ", character.plugins);
          const importedPlugins = await Promise.all(
            character.plugins.map(async (plugin) => {
              const importedPlugin = await import(plugin);
              return importedPlugin.default;
            })
          );
          character.plugins = importedPlugins;
        }

        loadedCharacters.push(character);
        elizaLogger.info(`Successfully loaded character from: ${resolvedPath}`);
      } catch (e) {
        elizaLogger.error(`Error parsing character from ${resolvedPath}: ${e}`);
        process.exit(1);
      }
    }
  }

  if (loadedCharacters.length === 0) {
    elizaLogger.info("No characters found, using default character");
    loadedCharacters.push(mainCharacter);
  }

  return loadedCharacters;
}

export function getTokenForProvider(
  provider: ModelProviderName,
  character: Character
) {
  switch (provider) {
    case ModelProviderName.OPENAI:
      return (
        character.settings?.secrets?.OPENAI_API_KEY || settings.OPENAI_API_KEY
      );
    case ModelProviderName.ETERNALAI:
      return (
        character.settings?.secrets?.ETERNALAI_API_KEY ||
        settings.ETERNALAI_API_KEY
      );
    case ModelProviderName.LLAMACLOUD:
    case ModelProviderName.TOGETHER:
      return (
        character.settings?.secrets?.LLAMACLOUD_API_KEY ||
        settings.LLAMACLOUD_API_KEY ||
        character.settings?.secrets?.TOGETHER_API_KEY ||
        settings.TOGETHER_API_KEY ||
        character.settings?.secrets?.XAI_API_KEY ||
        settings.XAI_API_KEY ||
        character.settings?.secrets?.OPENAI_API_KEY ||
        settings.OPENAI_API_KEY
      );
    case ModelProviderName.ANTHROPIC:
      return (
        character.settings?.secrets?.ANTHROPIC_API_KEY ||
        character.settings?.secrets?.CLAUDE_API_KEY ||
        settings.ANTHROPIC_API_KEY ||
        settings.CLAUDE_API_KEY
      );
    case ModelProviderName.REDPILL:
      return (
        character.settings?.secrets?.REDPILL_API_KEY || settings.REDPILL_API_KEY
      );
    case ModelProviderName.OPENROUTER:
      return (
        character.settings?.secrets?.OPENROUTER || settings.OPENROUTER_API_KEY
      );
    case ModelProviderName.GROK:
      return character.settings?.secrets?.GROK_API_KEY || settings.GROK_API_KEY;
    case ModelProviderName.HEURIST:
      return (
        character.settings?.secrets?.HEURIST_API_KEY || settings.HEURIST_API_KEY
      );
    case ModelProviderName.GROQ:
      return character.settings?.secrets?.GROQ_API_KEY || settings.GROQ_API_KEY;
    case ModelProviderName.GALADRIEL:
      return (
        character.settings?.secrets?.GALADRIEL_API_KEY ||
        settings.GALADRIEL_API_KEY
      );
    case ModelProviderName.FAL:
      return character.settings?.secrets?.FAL_API_KEY || settings.FAL_API_KEY;
    case ModelProviderName.ALI_BAILIAN:
      return (
        character.settings?.secrets?.ALI_BAILIAN_API_KEY ||
        settings.ALI_BAILIAN_API_KEY
      );
    case ModelProviderName.VOLENGINE:
      return (
        character.settings?.secrets?.VOLENGINE_API_KEY ||
        settings.VOLENGINE_API_KEY
      );
  }
}
function initializeDatabase(dataDir: string) {
  if (process.env.POSTGRES_URL) {
    console.log("process.env.POSTGRES_URL", process.env.POSTGRES_URL);
    elizaLogger.info("Initializing PostgreSQL connection...");
    const db = new PostgresDatabaseAdapter({
      connectionString: process.env.POSTGRES_URL,
      parseInputs: true,
    });

    db.init()
      .then(() => {
        elizaLogger.success("Successfully connected to Supabase database");
      })
      .catch((error) => {
        elizaLogger.error("Failed to connect to Supabase:", error);
      });

    return db;
  } else if (process.env.POSTGRES_URL) {
    console.log("process.env.POSTGRES_URL", process.env.POSTGRES_URL);
    elizaLogger.info("Initializing PostgreSQL connection...");
    const db = new PostgresDatabaseAdapter({
      connectionString: process.env.POSTGRES_URL,
      parseInputs: true,
    });

    db.init()
      .then(() => {
        elizaLogger.success("Successfully connected to PostgreSQL database");
      })
      .catch((error) => {
        elizaLogger.error("Failed to connect to PostgreSQL:", error);
      });

    return db;
  } else {
    const filePath =
      process.env.SQLITE_FILE ?? path.resolve(dataDir, "db.sqlite");
    console.log("filePath", filePath);
    const db = new SqliteDatabaseAdapter(new Database(filePath));
    return db;
  }
}

export async function initializeClients(
  character: Character,
  runtime: IAgentRuntime
) {
  const clients = [];
  const clientTypes = character.clients?.map((str) => str.toLowerCase()) || [];

  if (clientTypes.includes("auto")) {
    const autoClient = await AutoClientInterface.start(runtime);
    if (autoClient) clients.push(autoClient);
  }

  if (clientTypes.includes("discord")) {
    clients.push(await DiscordClientInterface.start(runtime));
  }

  if (clientTypes.includes("telegram")) {
    const telegramClient = await TelegramClientInterface.start(runtime);
    if (telegramClient) clients.push(telegramClient);
  }

  if (clientTypes.includes("twitter")) {
    const twitterClients = await TwitterClientInterface.start(runtime);
    clients.push(twitterClients);
  }

  if (clientTypes.includes("farcaster")) {
    const farcasterClients = new FarcasterAgentClient(runtime);
    farcasterClients.start();
    clients.push(farcasterClients);
  }

  if (character.plugins?.length > 0) {
    for (const plugin of character.plugins) {
      if (plugin.clients) {
        for (const client of plugin.clients) {
          clients.push(await client.start(runtime));
        }
      }
    }
  }

  return clients;
}

function getSecret(character: Character, secret: string) {
  return character.settings.secrets?.[secret] || process.env[secret];
}

let nodePlugin: any | undefined;

export function createAgent(
  character: Character,
  db: IDatabaseAdapter,
  cache: ICacheManager,
  token: string
) {
  elizaLogger.success(
    elizaLogger.successesTitle,
    "Creating runtime for character",
    character.name
  );

  nodePlugin ??= createNodePlugin();

    return new AgentRuntime({
        databaseAdapter: db,
        token,
        modelProvider: character.modelProvider,
        evaluators: [],
        character,
        plugins: [
            bootstrapPlugin,
            getSecret(character, "CONFLUX_CORE_PRIVATE_KEY")
                ? confluxPlugin
                : null,
            nodePlugin,
            getSecret(character, "SOLANA_PUBLIC_KEY") ||
            (getSecret(character, "WALLET_PUBLIC_KEY") &&
                !getSecret(character, "WALLET_PUBLIC_KEY")?.startsWith("0x"))
                ? solanaPlugin
                : null,
            getSecret(character, "EVM_PRIVATE_KEY") ||
            (getSecret(character, "WALLET_PUBLIC_KEY") &&
                !getSecret(character, "WALLET_PUBLIC_KEY")?.startsWith("0x"))
                ? evmPlugin
                : null,
            getSecret(character, "ZEROG_PRIVATE_KEY") ? zgPlugin : null,
            getSecret(character, "COINBASE_COMMERCE_KEY")
                ? coinbaseCommercePlugin
                : null,
            getSecret(character, "FAL_API_KEY") ||
            getSecret(character, "OPENAI_API_KEY") ||
            getSecret(character, "HEURIST_API_KEY")
                ? imageGenerationPlugin
                : null,
            ...(getSecret(character, "COINBASE_API_KEY") &&
            getSecret(character, "COINBASE_PRIVATE_KEY")
                ? [
                      coinbaseMassPaymentsPlugin,
                      tradePlugin,
                      tokenContractPlugin,
                      advancedTradePlugin,
                  ]
                : []),
            getSecret(character, "COINBASE_API_KEY") &&
            getSecret(character, "COINBASE_PRIVATE_KEY") &&
            getSecret(character, "COINBASE_NOTIFICATION_URI")
                ? webhookPlugin
                : null,
            getSecret(character, "WALLET_SECRET_SALT") ? teePlugin : null,
            getSecret(character, "ALCHEMY_API_KEY") ? goatPlugin : null,
            getSecret(character, "FLOW_ADDRESS") &&
            getSecret(character, "FLOW_PRIVATE_KEY")
                ? flowPlugin
                : null,
            getSecret(character, "APTOS_PRIVATE_KEY") ? aptosPlugin : null,
            getSecret(character, "STORY_PRIVATE_KEY") ? storyPlugin : null,
        ].filter(Boolean),
        providers: [],
        actions: [],
        services: [],
        managers: [],
        cacheManager: cache,
    });
}

function intializeFsCache(baseDir: string, character: Character) {
  const cacheDir = path.resolve(baseDir, character.id, "cache");

  const cache = new CacheManager(new FsCacheAdapter(cacheDir));
  return cache;
}

function intializeDbCache(character: Character, db: IDatabaseCacheAdapter) {
  const cache = new CacheManager(new DbCacheAdapter(db, character.id));
  return cache;
}

async function startAgent(character: Character, directClient) {
  let db: IDatabaseAdapter & IDatabaseCacheAdapter;
  try {
    character.id ??= stringToUuid(character.name);
    character.username ??= character.name;

    const token = getTokenForProvider(character.modelProvider, character);
    const dataDir = path.join(__dirname, "../data");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = initializeDatabase(dataDir) as IDatabaseAdapter &
      IDatabaseCacheAdapter;

    await db.init();

    const cache = intializeDbCache(character, db);
    const runtime = createAgent(character, db, cache, token);

    await runtime.initialize();

    const clients = await initializeClients(character, runtime);

    directClient.registerAgent(runtime);

    return clients;
  } catch (error) {
    elizaLogger.error(
      `Error starting agent for character ${character.name}:`,
      error
    );
    console.error(error);
    if (db) {
      await db.close();
    }
    throw error;
  }
}

const startAgents = async () => {
  const directClient = await DirectClientInterface.start();
  const args = parseArguments();
  let charactersArg = args.characters || args.character;
  let characters = [mainCharacter];

  if (charactersArg) {
    characters = await loadCharacters(charactersArg);
  }

  let marilynCharacterArg = args.marilyn;
  let marilynCharacter = null;

  if (marilynCharacterArg) {
    marilynCharacter = await loadCharacters(marilynCharacterArg);
    marilynCharacter = marilynCharacter[0];
  } else {
    elizaLogger.error(
      "Marilyn character not found, use --marilyn to specify a Marilyn character"
    );
    process.exit(1);
  }

  let db: IDatabaseAdapter & IDatabaseCacheAdapter;
  try {
    const dataDir = path.join(__dirname, "../data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = initializeDatabase(dataDir) as IDatabaseAdapter &
      IDatabaseCacheAdapter;
    await db.init();

    // Start all agents
    const startedAgents = [];
    for (const character of characters) {
      try {
        const agentInstance = await startAgent(character, directClient);
        startedAgents.push({
          id: character.id,
          agent: agentInstance,
          name: character.name,
        });
        await saveAccountStoryMetadata(character, db);
        elizaLogger.info(`Successfully started agent: ${character.name}`);
      } catch (error) {
        elizaLogger.error(`Failed to start agent ${character.name}:`, error);
      }
    }
    const marilynAgentInstance = await startAgent(
      marilynCharacter,
      directClient
    );
    startedAgents.push({
      id: marilynCharacter.id,
      agent: marilynAgentInstance,
      name: marilynCharacter.name,
    });
    await saveAccountStoryMetadata(marilynCharacter, db);
    elizaLogger.log(">>>> startedAgents", startedAgents);

    // Create shared room for multiple agents
    if (startedAgents.length > 1) {
      const agentIds = startedAgents.map((agent) => agent.id);
      const roomId = await db.createRoom(undefined);
      elizaLogger.info("Created room for agents:", {
        roomId,
        agents: startedAgents.map((a) => a.name),
      });

      // Start the conversation
      await startAgentConversation(startedAgents, db, roomId, marilynCharacter);
    } else {
      elizaLogger.info("Not enough agents to start a conversation");
    }
  } catch (error) {
    elizaLogger.error("Error in startAgents:", error);
    if (db) {
      await db.close();
    }
    throw error;
  }
};

async function saveAccountStoryMetadata(character: Character, db: IDatabaseAdapter & IDatabaseCacheAdapter) {
    console.log(">>>>>> saveAccountStoryMetadata", character.id);
    var agentIpId = null;
    var agentWalletAddress = null;
    var agentWalletPublicKey = null;
    var agentWalletPrivateKey = null;
    var agentLicenseTermId = null;
    var agentLicenseTermUri = null;
    var agentIpRegistrationTxnHash = null;
    var agentAvatarUrl = null;
    switch(character.id) {
        case process.env.MARILYN_AGENT_ID:
            agentIpId = process.env.MARILYN_IP_ID;
            agentWalletAddress = process.env.MARILYN_WALLET_ADDRESS;
            agentWalletPublicKey = process.env.MARILYN_WALLET_PUBLIC_KEY;
            agentWalletPrivateKey = process.env.MARILYN_WALLET_PRIVATE_KEY;
            agentLicenseTermId = process.env.MARILYN_LICENSE_TERM_ID;
            agentLicenseTermUri = process.env.MARILYN_LICENSE_TERM_URI;
            agentIpRegistrationTxnHash = process.env.MARILYN_IP_REGISTRATION_TXN_HASH;
            agentAvatarUrl = process.env.MARILYN_PICTURE_URL;
            break;
        case process.env.AGENT1_AGENT_ID:
            agentIpId = process.env.AGENT1_IP_ID;
            agentWalletAddress = process.env.AGENT1_WALLET_ADDRESS;
            agentWalletPublicKey = process.env.AGENT1_WALLET_PUBLIC_KEY;
            agentWalletPrivateKey = process.env.AGENT1_WALLET_PRIVATE_KEY;
            agentLicenseTermId = process.env.AGENT1_LICENSE_TERM_ID;
            agentLicenseTermUri = process.env.AGENT1_LICENSE_TERM_URI;
            agentIpRegistrationTxnHash = process.env.AGENT1_IP_REGISTRATION_TXN_HASH;
            agentAvatarUrl = process.env.AGENT1_PICTURE_URL;
            break;
        case process.env.AGENT2_AGENT_ID:
            agentIpId = process.env.AGENT2_IP_ID;
            agentWalletAddress = process.env.AGENT2_WALLET_ADDRESS;
            agentWalletPublicKey = process.env.AGENT2_WALLET_PUBLIC_KEY;
            agentWalletPrivateKey = process.env.AGENT2_WALLET_PRIVATE_KEY;
            agentLicenseTermId = process.env.AGENT2_LICENSE_TERM_ID;
            agentLicenseTermUri = process.env.AGENT2_LICENSE_TERM_URI;
            agentIpRegistrationTxnHash = process.env.AGENT2_IP_REGISTRATION_TXN_HASH;
            agentAvatarUrl = process.env.AGENT2_PICTURE_URL;
            break;
        case process.env.AGENT3_AGENT_ID:
            agentIpId = process.env.AGENT3_IP_ID;
            agentWalletAddress = process.env.AGENT3_WALLET_ADDRESS;
            agentWalletPublicKey = process.env.AGENT3_WALLET_PUBLIC_KEY;
            agentWalletPrivateKey = process.env.AGENT3_WALLET_PRIVATE_KEY;
            agentLicenseTermId = process.env.AGENT3_LICENSE_TERM_ID;
            agentLicenseTermUri = process.env.AGENT3_LICENSE_TERM_URI;
            agentIpRegistrationTxnHash = process.env.AGENT3_IP_REGISTRATION_TXN_HASH;
            agentAvatarUrl = process.env.AGENT3_PICTURE_URL;
            break;
        default:
            elizaLogger.error("Agent not found:", character.id, character.name);
            throw new Error("Agent not found");
    }

    const result = await (db as PostgresDatabaseAdapter).query(
        `UPDATE accounts
        SET "ipId" = $1,
            "walletAddress" = $2,
            "walletPublicKey" = $3,
            "walletPrivateKey" = $4,
            "licenseTermId" = $5,
            "licenseTermUri" = $6,
            "ipRegistrationTxnHash" = $7,
            "character" = $8,
            "avatarUrl" = $9
        WHERE id = $10`,
        [
            agentIpId,
            agentWalletAddress,
            agentWalletPublicKey,
            agentWalletPrivateKey,
            agentLicenseTermId,
            agentLicenseTermUri,
            agentIpRegistrationTxnHash,
            character,
            agentAvatarUrl,
            character.id
        ]
    )

    elizaLogger.info("Saved account story metadata for agent:", character.id, result);
}

async function startAgentConversation(
  agents: { id: string; agent: any[]; name: string }[],
  db: IDatabaseAdapter & IDatabaseCacheAdapter,
  roomId: string,
  marilynCharacter: Character
) {
  const marilyn = agents.find((agent) => agent.id === marilynCharacter.id);
  const otherAgents = agents.filter(
    (agent) => agent.id !== marilynCharacter.id
  );
  elizaLogger.info(`Marilyn: ${marilyn.name}`);
  elizaLogger.info(
    `Other agents: ${otherAgents.map((a) => a.name).join(", ")}`
  );

  if (!marilyn) {
    elizaLogger.error("Marilyn not found among agents");
    return;
  }
  const serverPort = parseInt(settings.SERVER_PORT || "3000");

  async function logConversation(
    fromAgent: { id: string; name: string },
    toAgent: { id: string; name: string },
    data: Content[],
    question?: string
  ) {
    const message = data[data.length - 1];
    const lastMessage = message.message || message.text;
    if (!lastMessage) {
      elizaLogger.error("No message content found:", message);
      return;
    }
    if (fromAgent.id === marilynCharacter.id) {
      elizaLogger.info(">>>> Marilyn data:", data);
      const userId = toAgent.id;
      const score = message.score;
      if (userId) {
        elizaLogger.info(
          `Saving score for userId: ${userId} with score: ${score}`
        );
        // Save to contestant_scores
        await (db as PostgresDatabaseAdapter).query(
            `INSERT INTO contestant_scores ("agentId", "score")
               VALUES ($1, $2)
               ON CONFLICT ("agentId") DO UPDATE
               SET "score" = contestant_scores.score + EXCLUDED.score`,
          [userId, score]
        );

        // Save to conversation_logs
        await (db as PostgresDatabaseAdapter).query(
          `INSERT INTO conversation_logs (
                "agentId",
                "contestantMessage",
                "contestantMessageTime",
                "roomId",
                "question"
              ) VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4)`,
          [fromAgent.id, lastMessage, roomId, question]
        );

        // Get the previous message from the contestant
        const previousMessageResult = await (
          db as PostgresDatabaseAdapter
        ).query(
          `SELECT * FROM conversation_logs
             WHERE "agentId" = $1
             AND "marilynResponse" IS NULL
             ORDER BY "contestantMessageTime" DESC
             LIMIT 1`,
          [userId]
        );

        elizaLogger.info(
          `Previous message result: ${previousMessageResult.rows}`
        );

        if (previousMessageResult.rows.length > 0) {
          elizaLogger.info("Debug: Update values:", {
            message: lastMessage,
            score: score,
            rowId: previousMessageResult.rows[0].id,
          });
          // Update the existing record with Marilyn's response
          await (db as PostgresDatabaseAdapter).query(
            `UPDATE conversation_logs
               SET "marilynResponse" = $1,
                   "marilynResponseTime" = CURRENT_TIMESTAMP,
                   "interactionScore" = $2,
                   "question" = COALESCE($4, "question")
               WHERE id = $3`,
            [lastMessage, score, previousMessageResult.rows[0].id, question]
          );
          elizaLogger.info(
            `Debug: Successfully updated conversation`,
            lastMessage
          );
        }
      }
    } else {
      // This is a contestant's message - create new record
      await (db as PostgresDatabaseAdapter).query(
        `INSERT INTO conversation_logs (
            "agentId",
            "contestantMessage",
            "contestantMessageTime",
            "roomId"
          ) VALUES ($1, $2, CURRENT_TIMESTAMP, $3)`,
        [fromAgent.id, lastMessage, roomId]
      );
    }
  }

  async function generateAndHandleMessage(
    fromAgent: { id: string; name: string },
    toAgent: { id: string; name: string },
    currentQuestion?: string
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `http://localhost:${serverPort}/${fromAgent.id}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `[Respond to Marilyn's question: ${currentQuestion}]`,
            userId: fromAgent.id,
            userName: fromAgent.name,
            roomId: roomId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      data.forEach((message: { text: any }) =>
        elizaLogger.log(`${fromAgent.name}: ${message.text}`)
      );

      if (data.length > 0) {
        // Bachelor sends message to Marilyn
        const lastMessage = data[data.length - 1].text;
        await logConversation(fromAgent, toAgent, data, currentQuestion);
        // Marilyn replies to Bachelor
        const msgReplyData = await handleUserInput(lastMessage, toAgent.id);
        await logConversation(
          toAgent,
          fromAgent,
          msgReplyData,
          currentQuestion
        );
        return true;
      }

      return false;
    } catch (error) {
      elizaLogger.error(
        `Failed to generate/handle message from ${fromAgent.name}:`,
        error
      );
      return false;
    }
  }

  while (true) {
    try {
      // Start with Marilyn asking a dating question
      elizaLogger.info("Marilyn starting round table discussion");
      const marilynOpeningMessage = await fetch(
        `http://localhost:${serverPort}/${marilyn.id}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: "Start a group discussion with a thought-provoking dating or relationship question",
            userId: marilyn.id,
            userName: marilyn.name,
            roomId: roomId,
          }),
        }
      );

      if (marilynOpeningMessage.ok) {
        const openingData = await marilynOpeningMessage.json();
        elizaLogger.info("Debug - Full opening data:", openingData);

        if (openingData.length > 0) {
          const currentQuestion = openingData[0].message || openingData[0].text;
          // Log Marilyn's opening question and store it in the database
          elizaLogger.info(
            `Marilyn opens discussion: ${openingData[0].message}`
          );
          await (db as PostgresDatabaseAdapter).query(
            `INSERT INTO conversation_logs (
              "agentId",
              "contestantMessage",
              "marilynResponse",
              "contestantMessageTime",
              "marilynResponseTime",
              "roomId",
              "question"
            ) VALUES ($1, $2, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3, $2)`,
            [marilyn.id, currentQuestion, roomId]
          );

          // Have each agent respond to Marilyn's question
          for (const otherAgent of otherAgents) {
            elizaLogger.info(
              `${otherAgent.name} responding to Marilyn's question`
            );
            const success = await generateAndHandleMessage(
              otherAgent,
              marilyn,
              currentQuestion
            );
            if (success) {
              await new Promise((resolve) => setTimeout(resolve, 5000));
            } else {
              elizaLogger.info(">>>> failed to generate message:", success);
            }

            // Add longer delay between different agent conversations
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } else {
          elizaLogger.error("Failed to get Marilyn's opening message");
        }
      } else {
        elizaLogger.error("Failed to get Marilyn's opening message");
      }

      const waitTime = parseInt(
        process.env.AGENT_MESSAGE_INTERVAL_SECONDS || "5"
      );
      elizaLogger.info(
        `Waiting for next round table discussion: ${waitTime} seconds`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
    } catch (error) {
      elizaLogger.error("Error in agent conversation:", error);
      await new Promise((resolve) => setTimeout(resolve, 25000));
    }
  }
}

startAgents().catch((error) => {
  elizaLogger.error("Unhandled error in startAgents:", error);
  process.exit(1); // Exit the process after logging
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function handleUserInput(input, agentId) {
  if (input.toLowerCase() === "exit") {
    gracefulExit();
  }

  try {
    const serverPort = parseInt(settings.SERVER_PORT || "3000");

    const response = await fetch(
      `http://localhost:${serverPort}/${agentId}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          userId: "user",
          userName: "User",
        }),
      }
    );

    const data = await response.json();
    data.forEach((message) => elizaLogger.log(`${"Agent"}: ${message.text}`));
    return data;
  } catch (error) {
    console.error("Error fetching response:", error);
  }
}

async function gracefulExit() {
  elizaLogger.log("Terminating and cleaning up resources...");
  rl.close();
  process.exit(0);
}

rl.on("SIGINT", gracefulExit);
rl.on("SIGTERM", gracefulExit);
