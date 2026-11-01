// Writes openapi.json for the frontend dev. Run on every build: `npm run openapi`.
import fs from "node:fs";
import { buildOpenApi } from "../src/http/route.js";
import { modules } from "../src/modules/index.js";

fs.writeFileSync("openapi.json", JSON.stringify(buildOpenApi(modules), null, 2) + "\n");
console.log("wrote openapi.json");
process.exit(0);
