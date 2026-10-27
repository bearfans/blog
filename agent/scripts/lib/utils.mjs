import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Agent scripts live in agent/scripts/lib; the project root is three levels up.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function existsSync(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT" && fallback !== null) return fallback;
    throw new Error(`无法读取 JSON：${file}\n${err.message}`);
  }
}

export async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function toPosix(p) {
  return p.split(path.sep).join("/");
}

export function rootRelative(p) {
  return toPosix(path.relative(ROOT, path.resolve(p)));
}

export function parseDate(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) {
    throw new Error(`日期格式不正确：${value}。请使用 ISO 8601，例如 2026-10-27T15:30:00+08:00`);
  }
  return d;
}
