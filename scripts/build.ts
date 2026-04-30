import { $, buildScript } from "complete-node";

await buildScript(import.meta.dirname, async () => {
  await $`tsc`;
  await $`tsc --project ./webview/tsconfig.json`;
});
