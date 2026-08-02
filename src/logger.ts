import QRCode from "qrcode";

/**
 * Color utilities for terminal text output using ANSI escape sequences.
 */
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const BLUE = "\x1b[34m";

/**
 * Format string with ANSI color codes.
 *
 * @param text Content to be formatted
 * @param color ANSI color escape code
 * @returns Color-formatted string
 */
function colorize(text: string, color: string): string {
    return `${color}${text}${RESET}`;
}

/**
 * Log server startup routing endpoints with ANSI colored terminal text
 * and a terminal QR code for network access.
 *
 * @param port Network port number the server is listening on
 * @param lanIp Local area network IPv4 address or null if not available
 */
export async function logServerStart(port: number, lanIp: string | null): Promise<void> {
    const baseUrl = `http://localhost:${port}`;
    
    console.log(colorize("\n--- Presenter Server Active ---", `${BOLD}${CYAN}`));
    console.log(`${colorize("Server running at:", BOLD)} ${colorize(baseUrl, GREEN)}`);
    console.log(`${colorize("Control:     ", DIM)} ${colorize(`${baseUrl}/`, YELLOW)}`);
    console.log(`${colorize("Output:      ", DIM)} ${colorize(`${baseUrl}/output`, YELLOW)}`);
    console.log(`${colorize("Song Control:", DIM)} ${colorize(`${baseUrl}/song-control`, MAGENTA)}`);
    console.log(`${colorize("Song Output: ", DIM)} ${colorize(`${baseUrl}/song`, MAGENTA)}`);
    
    if (lanIp) {
        const lanUrl = `http://${lanIp}:${port}`;
        console.log(`${colorize("On your network:", BOLD)} ${colorize(lanUrl, GREEN)}`);
        try {
            const qrCode = await QRCode.toString(lanUrl, { type: "terminal", small: true });
            console.log("\n" + qrCode);
        } catch (err) {
            console.error("Failed to generate QR code:", err);
        }
    } else {
        console.log(colorize("No LAN network interface detected — server is only reachable via localhost", DIM));
    }

    console.log(colorize("-------------------------------\n", `${BOLD}${CYAN}`));
}

/**
 * Format HTTP request log entry with colored status code.
 *
 * @param method HTTP method name
 * @param path Request URL path
 * @param status HTTP response status code
 */
export function logRequest(method: string, path: string, status: number): void {
    let statusColor = GREEN;
    if (status >= 400 && status < 500) statusColor = YELLOW;
    if (status >= 500) statusColor = BLUE;
    
    const formattedStatus = colorize(`[${status}]`, statusColor);
    const formattedMethod = colorize(method.padEnd(6), BOLD);
    console.log(`${formattedMethod} ${path} ${formattedStatus}`);
}
