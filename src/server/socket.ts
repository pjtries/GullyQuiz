import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "./events";
import { GameEngine } from "./gameState";

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> | null = null;
let gameEngine: GameEngine | null = null;

export function initSocketServer(httpServer: HttpServer) {
  if (io) {
    return { io, gameEngine };
  }

  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      path: "/socket.io",
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
      transports: ["websocket", "polling"],
    }
  );

  gameEngine = new GameEngine(io);

  io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    socket.on("join_lobby", async (payload) => {
      try {
        await gameEngine?.handleJoinLobby(socket, payload);
      } catch (err) {
        console.error("[Socket.io] Error in join_lobby:", err);
        socket.emit("error_message", {
          code: "INTERNAL_ERROR",
          message: "Failed to join lobby.",
        });
      }
    });

    socket.on("submit_answer", (payload) => {
      try {
        gameEngine?.handleSubmitAnswer(socket, payload);
      } catch (err) {
        console.error("[Socket.io] Error in submit_answer:", err);
      }
    });

    socket.on("request_lobby_state", async ({ shopCode }) => {
      try {
        const session = await gameEngine?.getOrCreateSession(shopCode);
        if (session) {
          socket.join(shopCode);
          socket.emit("lobby_state_update", gameEngine!.getLobbySnapshot(session));
        }
      } catch (err) {
        console.error("[Socket.io] Error in request_lobby_state:", err);
      }
    });

    socket.on("force_start_match", async ({ shopCode, pin }) => {
      try {
        await gameEngine?.forceStartMatch(shopCode, pin);
      } catch (err) {
        console.error("[Socket.io] Error in force_start_match:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      gameEngine?.handleDisconnect(socket);
    });
  });

  return { io, gameEngine };
}

export function getSocketServer() {
  return { io, gameEngine };
}
