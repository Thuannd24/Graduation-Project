import { Client } from "@stomp/stompjs";
import keycloak from "./keycloak.js";

const getBrokerUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8080/api/v1";
  const wsProto = apiUrl.startsWith("https") ? "wss" : "ws";
  // Extract domain and port (e.g. localhost:8080 or domain.com)
  const host = apiUrl.replace(/^https?:\/\//, "").split("/")[0];
  return `${wsProto}://${host}/api/v1/public/chat/ws`;
};

interface WebSocketOptions {
  guestId?: string;
  roomId?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessageReceived?: (message: any) => void;
}

export const createWebSocketClient = (options: WebSocketOptions) => {
  const headers: Record<string, string> = {};

  if (keycloak.authenticated && keycloak.token) {
    headers["Authorization"] = `Bearer ${keycloak.token}`;
  } else if (options.guestId) {
    headers["Guest-Id"] = options.guestId;
  }

  const client = new Client({
    brokerURL: getBrokerUrl(),
    connectHeaders: headers,
    debug: (str) => {
      console.log("[STOMP Client Debug]", str);
    },
    reconnectDelay: 5000,
    heartbeatIncoming: 4000,
    heartbeatOutgoing: 4000,
  });

  client.onConnect = () => {
    console.log("STOMP connected successfully!");
    if (options.onConnect) {
      options.onConnect();
    }

    if (options.roomId && options.onMessageReceived) {
      client.subscribe(`/topic/room/${options.roomId}`, (message) => {
        try {
          const payload = JSON.parse(message.body);
          options.onMessageReceived!(payload);
        } catch (err) {
          console.error("Error parsing STOMP message payload:", err);
        }
      });
    }
  };

  client.onStompError = (frame) => {
    console.error("Broker reported error: " + frame.headers["message"]);
    console.error("Additional details: " + frame.body);
  };

  client.onWebSocketClose = () => {
    console.log("WebSocket connection closed");
    if (options.onDisconnect) {
      options.onDisconnect();
    }
  };

  return client;
};
