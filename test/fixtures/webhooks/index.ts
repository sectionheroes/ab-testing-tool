// Loads every fixture in this directory. Used by the WP2 service tests.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const dir = fileURLToPath(new URL(".", import.meta.url));

export type Json = Record<string, unknown>;

export function loadFixture(name: string): Json {
  return JSON.parse(readFileSync(join(dir, name), "utf8"));
}

export function allFixtures(): { name: string; payload: Json }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((name) => ({ name, payload: loadFixture(name) }));
}

export const orderFixtures = () => allFixtures().filter((f) => f.name.startsWith("orders-"));
