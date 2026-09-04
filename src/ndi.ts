import { dlopen, FFIType, ptr } from "bun:ffi";
import { Resvg } from "@resvg/resvg-js";
import { existsSync } from "fs";
import path from "path";

/**
 * NDI status report structure for API and UI consumers.
 */
export interface NdiStatus {
    available: boolean;
    version: string;
    sources: string[];
    error: string | null;
}

const WIDTH = 1920;
const HEIGHT = 1080;
const BYTES_PER_PIXEL = 4; // RGBA
const FRAME_BUFFER_SIZE = WIDTH * HEIGHT * BYTES_PER_PIXEL;

let ndiLib: any = null;
let scriptureSender: any = null;
let songSender: any = null;
let isNdiAvailable = false;
let ndiVersion = "";
let ndiError: string | null = null;

// Pixel buffers for both output channels (RGBA)
const scriptureBuffer = new Uint8Array(FRAME_BUFFER_SIZE);
const songBuffer = new Uint8Array(FRAME_BUFFER_SIZE);

// Pre-allocated NDI video frame structures (72 bytes)
let scriptureFrameStruct: Uint8Array | null = null;
let songFrameStruct: Uint8Array | null = null;
let streamInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Locate NDI dynamic shared library across supported operating systems.
 */
function findNdiLibrary(): string | null {
    const platform = process.platform;
    const candidates: string[] = [];

    if (platform === "linux") {
        candidates.push(
            "/usr/local/lib/libndi.so.6",
            "/usr/local/lib/libndi.so",
            "/usr/lib/libndi.so.6",
            "/usr/lib/libndi.so",
            "/usr/lib/x86_64-linux-gnu/libndi.so.6",
            "/usr/lib/x86_64-linux-gnu/libndi.so",
            "libndi.so.6",
            "libndi.so"
        );
    } else if (platform === "win32") {
        if (process.env.NDI_RUNTIME_DIR_V6) {
            candidates.push(path.join(process.env.NDI_RUNTIME_DIR_V6, "Processing.NDI.Lib.x64.dll"));
        }
        if (process.env.ProgramFiles) {
            candidates.push(
                path.join(process.env.ProgramFiles, "NDI", "NDI 6 Runtime", "v6", "Processing.NDI.Lib.x64.dll"),
                path.join(process.env.ProgramFiles, "NDI", "NDI 6 SDK", "Bin", "x64", "Processing.NDI.Lib.x64.dll"),
                path.join(process.env.ProgramFiles, "NewTek", "NDI 5 Runtime", "v5", "Processing.NDI.Lib.x64.dll")
            );
        }
        candidates.push("Processing.NDI.Lib.x64.dll");
    } else if (platform === "darwin") {
        if (process.env.NDI_RUNTIME_DIR_V6) {
            candidates.push(path.join(process.env.NDI_RUNTIME_DIR_V6, "libndi.dylib"));
        }
        candidates.push(
            "/usr/local/lib/libndi.dylib",
            "/Library/NDI SDK for Apple/lib/macOS/libndi.dylib",
            "libndi.dylib"
        );
    }

    for (const c of candidates) {
        if (c.includes("/") || c.includes("\\")) {
            if (existsSync(c)) return c;
        } else {
            return c;
        }
    }
    return null;
}

/**
 * Construct 72-byte NDIlib_video_frame_v2_t structure pointing to a pixel buffer.
 */
function createFrameStruct(pixelBuffer: Uint8Array): Uint8Array {
    const struct = new Uint8Array(72);
    const view = new DataView(struct.buffer);
    view.setInt32(0, WIDTH, true);                     // xres
    view.setInt32(4, HEIGHT, true);                    // yres
    view.setUint32(8, 0x41424752, true);               // FourCC = RGBA
    view.setInt32(12, 30, true);                       // frame_rate_N (30 fps)
    view.setInt32(16, 1, true);                        // frame_rate_D
    view.setFloat32(20, 16.0 / 9.0, true);             // picture_aspect_ratio
    view.setInt32(24, 1, true);                        // frame_format_type (progressive)
    view.setBigInt64(32, 0n, true);                    // timecode
    view.setBigUint64(40, BigInt(ptr(pixelBuffer)), true); // p_data
    view.setInt32(48, WIDTH * BYTES_PER_PIXEL, true);  // line_stride_in_bytes
    view.setBigUint64(56, 0n, true);                   // p_metadata
    view.setBigInt64(64, 0n, true);                    // timestamp
    return struct;
}

/**
 * Create an NDI sender instance with the specified broadcast name.
 */
function createNdiSender(name: string): any {
    const settings = new Uint8Array(24);
    const view = new DataView(settings.buffer);
    const nameBuf = Buffer.from(name + "\0");
    view.setBigUint64(0, BigInt(ptr(nameBuf)), true);
    view.setBigUint64(8, 0n, true); // p_groups = null
    view.setUint8(16, 1);           // clock_video = true
    view.setUint8(17, 0);           // clock_audio = false
    return ndiLib.symbols.NDIlib_send_create(ptr(settings));
}

/**
 * XML escape helper for safe SVG generation.
 */
function escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case "<": return "&lt;";
            case ">": return "&gt;";
            case "&": return "&amp;";
            case "'": return "&apos;";
            case '"': return "&quot;";
            default: return c;
        }
    });
}

/**
 * Word wrap text into balanced lines for screen display.
 */
function wrapText(text: string, maxCharsPerLine: number = 44): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";
    for (const word of words) {
        if ((currentLine + " " + word).trim().length > maxCharsPerLine) {
            if (currentLine) lines.push(currentLine.trim());
            currentLine = word;
        } else {
            currentLine = (currentLine + " " + word).trim();
        }
    }
    if (currentLine) lines.push(currentLine.trim());
    return lines;
}

/**
 * Render Scripture verse into 1080p RGBA pixel buffer.
 */
function renderScriptureFrame(book: string, chapter: number, verse: number, text: string): void {
    const lines = wrapText(text, 46);
    const ref = `${book} ${chapter}:${verse}`;

    const fontSize = lines.length > 5 ? 38 : lines.length > 3 ? 46 : 56;
    const lineHeight = fontSize * 1.36;
    const refFontSize = Math.max(28, Math.floor(fontSize * 0.68));
    const totalHeight = lines.length * lineHeight + refFontSize + 40;
    const startY = Math.max(120, (HEIGHT - totalHeight) / 2 + fontSize);

    const tspans = lines
        .map((l, i) => `<tspan x="960" y="${startY + i * lineHeight}">${escapeXml(l)}</tspan>`)
        .join("");
    const refY = startY + (lines.length - 1) * lineHeight + refFontSize + 36;

    const svg = `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="7" flood-color="black" flood-opacity="0.95"/>
          <feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="black" flood-opacity="0.8"/>
        </filter>
      </defs>
      <text filter="url(#shadow)" x="960" font-family="'Book Antiqua', 'Palatino Linotype', 'Georgia', 'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle">
        ${tspans}
      </text>
      <text filter="url(#shadow)" x="960" y="${refY}" font-family="'Book Antiqua', 'Palatino Linotype', 'Georgia', 'Times New Roman', serif" font-size="${refFontSize}" font-weight="bold" fill="#e8d9a0" text-anchor="middle">
        ${escapeXml(ref)}
      </text>
    </svg>`;

    try {
        const resvg = new Resvg(svg);
        const image = resvg.render();
        scriptureBuffer.set(image.pixels);
    } catch (err) {
        console.error("[NDI] Error rendering scripture frame:", err);
    }
}

/**
 * Render Song lyrics into 1080p RGBA pixel buffer.
 */
function renderSongFrame(mode: string, text: string): void {
    const rawLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!rawLines.length) {
        songBuffer.fill(0);
        return;
    }

    if (mode === "lower") {
        // Lower-third mode: fixed to the lower portion with subtle backdrop & crisp shadow
        const fontSize = rawLines.length > 2 ? 38 : 46;
        const lineHeight = fontSize * 1.35;
        const totalHeight = rawLines.length * lineHeight + 40;
        const boxY = HEIGHT - totalHeight - 60;
        const startY = boxY + 28 + fontSize * 0.8;

        const tspans = rawLines
            .map((l, i) => `<tspan x="960" y="${startY + i * lineHeight}">${escapeXml(l)}</tspan>`)
            .join("");

        const svg = `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="black" flood-opacity="0.95"/>
            </filter>
          </defs>
          <rect x="160" y="${boxY}" width="1600" height="${totalHeight}" rx="12" fill="black" fill-opacity="0.45" />
          <text filter="url(#shadow)" x="960" font-family="'Book Antiqua', 'Palatino Linotype', 'Georgia', 'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle">
            ${tspans}
          </text>
        </svg>`;

        try {
            const resvg = new Resvg(svg);
            const image = resvg.render();
            songBuffer.set(image.pixels);
        } catch (err) {
            console.error("[NDI] Error rendering song lower frame:", err);
        }
    } else {
        // Background mode: full screen centered text
        const fontSize = rawLines.length > 6 ? 36 : rawLines.length > 4 ? 44 : 54;
        const lineHeight = fontSize * 1.38;
        const totalHeight = rawLines.length * lineHeight;
        const startY = (HEIGHT - totalHeight) / 2 + fontSize * 0.85;

        const tspans = rawLines
            .map((l, i) => `<tspan x="960" y="${startY + i * lineHeight}">${escapeXml(l)}</tspan>`)
            .join("");

        const svg = `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="black" flood-opacity="0.95"/>
            </filter>
          </defs>
          <text filter="url(#shadow)" x="960" font-family="'Book Antiqua', 'Palatino Linotype', 'Georgia', 'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle">
            ${tspans}
          </text>
        </svg>`;

        try {
            const resvg = new Resvg(svg);
            const image = resvg.render();
            songBuffer.set(image.pixels);
        } catch (err) {
            console.error("[NDI] Error rendering song background frame:", err);
        }
    }
}

/**
 * Handle incoming scripture WebSocket message and update NDI frame buffer.
 */
export function onScriptureUpdate(data: Record<string, unknown>): void {
    if (!isNdiAvailable) return;
    if (data.type === "clear") {
        scriptureBuffer.fill(0);
        return;
    }
    const book = typeof data.book === "string" ? data.book : "";
    const chapter = typeof data.chapter === "number" ? data.chapter : 0;
    const verse = typeof data.verse === "number" ? data.verse : 0;
    const text = typeof data.text === "string" ? data.text : "";

    if (text) {
        renderScriptureFrame(book, chapter, verse, text);
    }
}

/**
 * Handle incoming song WebSocket message and update NDI frame buffer.
 */
export function onSongUpdate(data: Record<string, unknown>): void {
    if (!isNdiAvailable) return;
    if (data.type === "clear") {
        songBuffer.fill(0);
        return;
    }
    const mode = typeof data.mode === "string" ? data.mode : "lower";
    const text = typeof data.text === "string" ? data.text : "";

    if (text) {
        renderSongFrame(mode, text);
    }
}

/**
 * Query current NDI engine status.
 */
export function getNdiStatus(): NdiStatus {
    return {
        available: isNdiAvailable,
        version: ndiVersion,
        sources: isNdiAvailable ? ["Presenter - Scripture", "Presenter - Songs"] : [],
        error: ndiError,
    };
}

/**
 * Initialize NDI runtime library, create video senders, and start streaming loop.
 */
export function initNdi(): boolean {
    const libPath = findNdiLibrary();
    if (!libPath) {
        ndiError = "NDI runtime library not found on system";
        isNdiAvailable = false;
        return false;
    }

    try {
        ndiLib = dlopen(libPath, {
            NDIlib_initialize: { args: [], returns: FFIType.bool },
            NDIlib_destroy: { args: [], returns: FFIType.void },
            NDIlib_version: { args: [], returns: FFIType.cstring },
            NDIlib_send_create: { args: [FFIType.ptr], returns: FFIType.ptr },
            NDIlib_send_destroy: { args: [FFIType.ptr], returns: FFIType.void },
            NDIlib_send_send_video_v2: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.void },
        });

        const initialized = ndiLib.symbols.NDIlib_initialize();
        if (!initialized) {
            ndiError = "NDIlib_initialize() returned false";
            isNdiAvailable = false;
            return false;
        }

        try {
            ndiVersion = String(ndiLib.symbols.NDIlib_version() ?? "NDI v6");
        } catch {
            ndiVersion = "NDI SDK";
        }

        scriptureSender = createNdiSender("Presenter - Scripture");
        songSender = createNdiSender("Presenter - Songs");

        if (!scriptureSender || !songSender) {
            ndiError = "Failed to create NDI senders";
            isNdiAvailable = false;
            return false;
        }

        scriptureFrameStruct = createFrameStruct(scriptureBuffer);
        songFrameStruct = createFrameStruct(songBuffer);

        // Continuous 30fps video stream loop
        streamInterval = setInterval(() => {
            if (!ndiLib || !scriptureSender || !songSender || !scriptureFrameStruct || !songFrameStruct) return;
            ndiLib.symbols.NDIlib_send_send_video_v2(scriptureSender, ptr(scriptureFrameStruct));
            ndiLib.symbols.NDIlib_send_send_video_v2(songSender, ptr(songFrameStruct));
        }, 33);

        isNdiAvailable = true;
        ndiError = null;
        return true;
    } catch (err: any) {
        ndiError = err?.message || String(err);
        isNdiAvailable = false;
        return false;
    }
}

/**
 * Gracefully terminate NDI senders and destroy NDI library on shutdown.
 */
export function shutdownNdi(): void {
    if (streamInterval) {
        clearInterval(streamInterval);
        streamInterval = null;
    }
    if (ndiLib) {
        try {
            if (scriptureSender) ndiLib.symbols.NDIlib_send_destroy(scriptureSender);
            if (songSender) ndiLib.symbols.NDIlib_send_destroy(songSender);
            ndiLib.symbols.NDIlib_destroy();
        } catch {}
    }
    isNdiAvailable = false;
}
