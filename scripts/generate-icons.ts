import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
// @ts-ignore
import pngToIco from "png-to-ico";

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const svgPath = path.resolve("assets/icon.svg");
const svgContent = readFileSync(svgPath, "utf-8");

mkdirSync("assets", { recursive: true });
mkdirSync("public", { recursive: true });

console.log("Rendering PNG icons at multiple resolutions...");
const pngBuffers: { size: number; buf: Buffer }[] = [];

for (const size of SIZES) {
    const resvg = new Resvg(svgContent, {
        fitTo: {
            mode: "width",
            value: size,
        },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    writeFileSync(`assets/icon-${size}.png`, pngBuffer);
    pngBuffers.push({ size, buf: pngBuffer });
}

// Write standard 256x256 as default icon.png
writeFileSync("assets/icon.png", pngBuffers.find(b => b.size === 256)!.buf);
writeFileSync("public/icon.png", pngBuffers.find(b => b.size === 256)!.buf);

console.log("Packaging multi-resolution Windows .ico (16, 24, 32, 48, 64, 128, 256)...");
const icoPngs = ["16", "24", "32", "48", "64", "128", "256"].map(s => `assets/icon-${s}.png`);
const icoBuffer = await pngToIco(icoPngs);

writeFileSync("assets/icon.ico", icoBuffer);
writeFileSync("public/favicon.ico", icoBuffer);

console.log("Icons generated successfully in assets/ and public/!");
