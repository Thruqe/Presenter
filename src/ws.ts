import type { ServerWebSocket } from "bun";
import type { ChannelMessage } from "./types";

/**
 * Connected WebSocket clients pool.
 */
const clients = new Set<ServerWebSocket<unknown>>();

/**
 * Cache for last broadcasted scripture message.
 */
let lastVerse: string | null = null;

/**
 * Cache for last broadcasted song message.
 */
let lastSong: string | null = null;

/**
 * Handle new WebSocket connection open event.
 *
 * @param ws Incoming ServerWebSocket client instance
 */
export function handleWsOpen(ws: ServerWebSocket<unknown>): void {
    clients.add(ws);
    if (lastVerse !== null) {
        ws.send(lastVerse);
    }
    if (lastSong !== null) {
        ws.send(lastSong);
    }
}

/**
 * Handle WebSocket client disconnection event.
 *
 * @param ws Closed ServerWebSocket client instance
 */
export function handleWsClose(ws: ServerWebSocket<unknown>): void {
    clients.delete(ws);
}

/**
 * Handle incoming WebSocket client message and broadcast updates.
 *
 * @param _ws Originating ServerWebSocket client instance
 * @param message Raw message string or buffer payload
 */
export function handleWsMessage(_ws: ServerWebSocket<unknown>, message: string | Buffer): void {
    const str = message.toString();
    try {
        const data = JSON.parse(str) as ChannelMessage;
        if (data && typeof data === "object") {
            if (data.channel === "song") {
                lastSong = str;
            } else if (data.channel === "scripture") {
                lastVerse = str;
            }
        }
    } catch {
        // Ignore malformed JSON payloads
    }

    for (const client of clients) {
        client.send(str);
    }
}
