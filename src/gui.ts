import { Webview } from "webview-bun";

const worker = new Worker("./index.ts");

worker.onmessage = (event: MessageEvent<{ type: string; port: number }>) => {
    if (event.data?.type === "ready") {
        const { port } = event.data;

        const control = new Webview();
        control.title = "Presenter — Control";
        control.navigate(`http://localhost:${port}/`);
        control.run();
    }
};

worker.onerror = (err) => {
    console.error("Server worker failed to start:", err);
};