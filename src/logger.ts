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
 * Log server startup routing endpoints with ANSI colored terminal text.
 *
 * @param port Network port number the server is listening on
 */
export function logServerStart(port: number): void {
    const baseUrl = `http://localhost:${port}`;
    
    console.log(colorize("\n--- Presenter Server Active ---", `${BOLD}${CYAN}`));
    console.log(`${colorize("Server running at:", BOLD)} ${colorize(baseUrl, GREEN)}`);
    console.log(`${colorize("Control:     ", DIM)} ${colorize(`${baseUrl}/`, YELLOW)}`);
    console.log(`${colorize("Output:      ", DIM)} ${colorize(`${baseUrl}/output`, YELLOW)}`);
    console.log(`${colorize("Song Control:", DIM)} ${colorize(`${baseUrl}/song-control`, MAGENTA)}`);
    console.log(`${colorize("Song Output: ", DIM)} ${colorize(`${baseUrl}/song`, MAGENTA)}`);
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
