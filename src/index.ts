import type { ServerWebSocket } from "bun";
import { networkInterfaces } from "os";
import { logServerStart, logRequest } from "./logger";
import {
    parseRef,
    getFullChapterVerses,
    findBooks,
    searchFuzzyVerses,
    getSingleVerse,
} from "./scripture";
import {
    listSongs,
    insertSong,
    insertSection,
    insertLine,
    deleteSong,
    getFullSong,
} from "./songs";
import {
    handleWsOpen,
    handleWsClose,
    handleWsMessage,
} from "./ws";
import type { CreateSongInput, BookSearchResult } from "./types";

const PREFERRED_PORT = Number(process.env.PORT) || 8642;

/**
 * Determine the machine's LAN-facing IPv4 address so other devices on the
 * same network can reach this server.
 *
 * @returns The first non-internal IPv4 address found, or null if none exists
 *          (e.g. no network connection).
 */
function getLocalIp(): string | null {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] ?? []) {
            if (net.family === "IPv4" && !net.internal) {
                return net.address;
            }
        }
    }
    return null;
}

/**
 * Main application HTTP web server request router.
 *
 * @param req Incoming HTTP request object
 * @param server Active Bun server instance
 * @returns HTTP response object or undefined if upgraded to WebSocket
 */
async function handleFetch(req: Request, server: Bun.Server<unknown>): Promise<Response | undefined> {
    const url = new URL(req.url);
    const path = url.pathname;

    // WebSocket upgrade route
    if (path === "/ws") {
        if (server.upgrade(req, { data: undefined })) {
            return undefined;
        }
        logRequest(req.method, path, 500);
        return new Response("Upgrade failed", { status: 500 });
    }

    let response: Response;

    // Static HTML page routes
    if (path === "/") {
        response = new Response(Bun.file("public/control.html"));
    } else if (path === "/output") {
        response = new Response(Bun.file("public/output.html"));
    } else if (path === "/image.png") {
        response = new Response(Bun.file("public/image.png"));
    } else if (path === "/song") {
        response = new Response(Bun.file("public/song-output.html"));
    } else if (path === "/song-control") {
        response = new Response(Bun.file("public/song-control.html"));
    }
    // Scripture search endpoint
    else if (path === "/api/search") {
        const queryParam = url.searchParams.get("q");
        const query = queryParam ? queryParam.trim() : "";

        if (query.length < 1) {
            response = Response.json([]);
        } else {
            const ref = parseRef(query);
            if (ref !== null) {
                const chapterVerses = getFullChapterVerses(ref.book, ref.chapter);
                response = Response.json(chapterVerses);
            } else {
                const books = findBooks(query);
                if (books.length > 0) {
                    const result: BookSearchResult[] = books.map((b) => ({
                        type: "book",
                        name: b.name,
                    }));
                    response = Response.json(result);
                } else {
                    const searchResults = searchFuzzyVerses(query);
                    response = Response.json(searchResults);
                }
            }
        }
    }
    // Single verse retrieval endpoint
    else if (path === "/api/verse") {
        const bookParam = url.searchParams.get("book");
        const chapterParam = url.searchParams.get("chapter");
        const verseParam = url.searchParams.get("verse");

        if (bookParam === null || chapterParam === null || verseParam === null) {
            response = Response.json({});
        } else {
            const chapterNum = parseInt(chapterParam, 10);
            const verseNum = parseInt(verseParam, 10);

            if (isNaN(chapterNum) || isNaN(verseNum)) {
                response = Response.json({});
            } else {
                const verseRecord = getSingleVerse(bookParam, chapterNum, verseNum);
                response = Response.json(verseRecord ?? {});
            }
        }
    }
    // Songs listing & creation endpoint
    else if (path === "/api/songs") {
        if (req.method === "GET") {
            response = Response.json(listSongs.all());
        } else if (req.method === "POST") {
            try {
                const body = (await req.json()) as Partial<CreateSongInput>;
                const title = typeof body.title === "string" ? body.title : "";
                const displayMode = typeof body.display_mode === "string" ? body.display_mode : "lower";
                const sections = Array.isArray(body.sections) ? body.sections : [];

                const songRow = insertSong.get(title, displayMode);
                const songId = songRow ? songRow.id : 0;

                sections.forEach((sec, i) => {
                    const label = typeof sec.label === "string" ? sec.label : "";
                    const lines = Array.isArray(sec.lines) ? sec.lines : [];

                    const secRow = insertSection.get(songId, label, i);
                    const secId = secRow ? secRow.id : 0;

                    lines.forEach((line, j) => {
                        const lineText = typeof line === "string" ? line : "";
                        insertLine.run(secId, lineText, j);
                    });
                });

                response = Response.json({ id: songId });
            } catch {
                response = new Response("Invalid JSON payload", { status: 400 });
            }
        } else {
            response = new Response("Method not allowed", { status: 405 });
        }
    }
    // Individual song endpoint matching /api/songs/:id
    else {
        const songMatch = path.match(/^\/api\/songs\/(\d+)$/);
        if (songMatch !== null && songMatch[1] !== undefined) {
            const songId = parseInt(songMatch[1], 10);
            if (isNaN(songId)) {
                response = new Response("Invalid song ID", { status: 400 });
            } else if (req.method === "GET") {
                const song = getFullSong(songId);
                response = Response.json(song ?? {});
            } else if (req.method === "DELETE") {
                deleteSong.run(songId);
                response = Response.json({ ok: true });
            } else {
                response = new Response("Method not allowed", { status: 405 });
            }
        } else {
            response = new Response("Not found", { status: 404 });
        }
    }

    logRequest(req.method, path, response.status);
    return response;
}

/**
 * Initialize Bun server instance and configure routes + web sockets.
 */
const server = Bun.serve({
    port: PREFERRED_PORT,
    hostname: "0.0.0.0",
    fetch(req, srv) {
        return handleFetch(req, srv);
    },
    websocket: {
        open(ws: ServerWebSocket<unknown>) {
            handleWsOpen(ws);
        },
        close(ws: ServerWebSocket<unknown>) {
            handleWsClose(ws);
        },
        message(ws: ServerWebSocket<unknown>, message: string | Buffer) {
            handleWsMessage(ws, message);
        },
    },
});

const activePort = server.port ?? PREFERRED_PORT;
const lanIp = getLocalIp();
await logServerStart(activePort, lanIp);