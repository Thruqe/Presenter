import { rcedit } from "rcedit";
import { existsSync } from "fs";
import { spawnSync } from "child_process";
import path from "path";

const iconPath = path.resolve("assets/icon.ico");

const targets = [
    {
        exe: path.resolve("dist/presenter-server-windows-x64.exe"),
        desc: "Presenter Server — Scripture & Song Presentation System (Web & NDI Engine)",
        originalName: "Presenter-Server.exe",
    },
    {
        exe: path.resolve("dist/presenter-gui-windows-x64.exe"),
        desc: "Presenter — Modern Church Scripture & Song Presentation System",
        originalName: "Presenter.exe",
    },
];

console.log("Checking environment for Windows PE binary stamping...");

if (process.platform !== "win32") {
    const wineCheck = spawnSync("which", ["wine"], { stdio: "ignore" });
    if (wineCheck.status !== 0) {
        console.log(`[Info] Non-Windows environment (${process.platform}) without Wine detected.`);
        console.log("[Info] Windows PE metadata & icon stamping will run automatically in the CI Windows runner (windows-latest).");
        process.exit(0);
    }
}

for (const target of targets) {
    if (!existsSync(target.exe)) {
        console.log(`[Info] ${path.basename(target.exe)} does not exist in dist/, skipping.`);
        continue;
    }

    try {
        await rcedit(target.exe, {
            "version-string": {
                CompanyName: "Thruqe",
                FileDescription: target.desc,
                LegalCopyright: "Copyright © 2026 Thruqe. All rights reserved.",
                ProductName: "Presenter",
                OriginalFilename: target.originalName,
                InternalFilename: "Presenter",
                Comments: "Presenter - Modern Church Scripture & Song Presentation System",
            },
            "file-version": "1.0.0.0",
            "product-version": "1.0.0.0",
            icon: iconPath,
        });
        console.log(`[Success] Embedded icon and version metadata into ${path.basename(target.exe)}`);
    } catch (err: any) {
        console.warn(`[Notice] Could not stamp ${path.basename(target.exe)}: ${err?.message || err}`);
    }
}
