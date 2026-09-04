// On Windows, detach and hide any console window immediately when launched in GUI mode
if (process.platform === "win32") {
    try {
        const { dlopen, FFIType } = await import("bun:ffi");
        const kernel32 = dlopen("kernel32.dll", {
            FreeConsole: {
                args: [],
                returns: FFIType.bool,
            },
        });
        kernel32.symbols.FreeConsole();
    } catch {
        // Fallback silently if FreeConsole / FFI is unavailable
    }
}

const worker = new Worker("./index.ts");

worker.onmessage = async (event: MessageEvent<{ type: string; port: number }>) => {
    if (event.data?.type === "ready") {
        const { port } = event.data;

        // @ts-ignore
        const modName = "webview-bun";
        const { Webview } = await import(modName);
        const control = new Webview();
        control.title = "Presenter — Control";
        control.navigate(`http://localhost:${port}/`);
        control.run();
    }
};

worker.onerror = (err) => {
    console.error("Server worker failed to start:", err);
};