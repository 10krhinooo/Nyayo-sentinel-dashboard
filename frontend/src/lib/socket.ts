"use client";

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
    socket = io(apiBaseUrl, {
      withCredentials: true
      // Cookie-based auth: the nyayo_access_token httpOnly cookie is sent
      // automatically via withCredentials; the server reads it in handshake.
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
