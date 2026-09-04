
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