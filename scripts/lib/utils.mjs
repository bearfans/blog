import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

export function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("\n", " ");
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

const DATE_FMT = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const DATE_SHORT_FMT = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatDateLong(value) {
  return DATE_FMT.format(parseDate(value));
}

export function formatDateShort(value) {
  return DATE_SHORT_FMT.format(parseDate(value)).replaceAll("/", ".");
}

export function formatDateIso(value) {
  return parseDate(value).toISOString();
}

export function countWords(markdown) {
  const plain = String(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\{\{image:\d+\}\}/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_~\-|]/g, " ");
  const cjk = (plain.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const latin = (plain.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + latin;
}

export function readingMinutes(words) {
  return Math.max(1, Math.ceil(words / 400));
}

export function isCjk(char) {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(char);
}

export function smartJoin(lines) {
  let out = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!out) {
      out = line;
      continue;
    }
    const prev = out.slice(-1);
    const next = line.charAt(0);
    if (isCjk(prev) || isCjk(next)) out += line;
    else out += " " + line;
  }
  return out;
}

export function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function svgIcon(name) {
  const icons = {
    copy: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M5 15V6a2 2 0 0 1 2-2h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  return icons[name] || "";
}
