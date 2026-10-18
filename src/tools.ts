/*
 * Tool implementations. Each takes the factory config plus validated arguments and returns
 * a plain object that the server serialises for the agent. No MCP types here, so every
 * tool can be unit-tested directly. Grouped by area in ./tools/; this file is the one import point.
 */
export * from "./tools/build.js";
export * from "./tools/clients.js";
export * from "./tools/deploy.js";
export { DEPLOYS_FILE } from "./tools/shared.js";
export * from "./tools/site-files.js";
