
import { generateImportMapForProjectPackage } from "@jsenv/node-module-import-map";

(async () => {
    await generateImportMapForProjectPackage({
        projectDirectoryUrl: new URL("../", import.meta.url),
        includeDevDependencies: false,
        importMapFile: true,
        importMapFileRelativeUrl: "./build/import-map.json",
        importMapFileLog: true,
        favoredExports: ["browser"]
    });
})();
