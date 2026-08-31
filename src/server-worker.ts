// This worker just runs index.ts as-is, then tells main thread the port
import "./index"; // your existing Bun.serve() call executes here

// index.ts would need to export activePort, or we listen via a tiny tweak below