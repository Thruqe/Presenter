declare module "webview-bun" {
    export class Webview {
        title: string;
        size: { width: number; height: number; hints: number };
        constructor(debug?: boolean);
        navigate(url: string): void;
        run(): void;
        destroy(): void;
    }
}
