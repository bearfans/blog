#!/usr/bin/env node
/**
 * Generate a cover and up to four inline images for an article.
 *
 * Usage:
 *   node scripts/generate-images.mjs content/<slug>/meta.json
 *   node scripts/generate-images.mjs content/<slug>/meta.json --force
 *
 * Default provider: Pollinations (no key required, but free requests are
 * rate-limited to roughly one image every 45 seconds per IP).
 * Optional: set POLLINATIONS_API_KEY to use the authenticated endpoint.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, ensureDir, readJson, rootRelative, writeJson } from "./lib/utils.mjs";

const args = process.argv.slice(2);
const metaArg = args.find((a) => !a.startsWith("--"));
const force = args.includes("--force");
const only = (() => {
  const i = args.indexOf("--only");
  return i >= 0 ? args[i + 1] : null;
})();

if (!metaArg) {
  console.error("用法：node scripts/generate-images.mjs content/<slug>/meta.json [--force] [--only cover|1|2|3|4]");
  process.exit(1);
}

const metaPath = path.resolve(ROOT, metaArg);
const meta = await readJson(metaPath);
const slug = String(meta.slug || "").trim();

if (!slug) {
  console.error("meta.json 缺少 slug 字段。");
  process.exit(1);
}
if (!meta.cover?.prompt) {
  console.error("meta.json 缺少 cover.prompt。封面图是必填项。");
  process.exit(1);
}

const inlineSpecs = Array.isArray(meta.images) ? meta.images.slice(0, 4) : [];
if (Array.isArray(meta.images) && meta.images.length > 4) {
  console.warn(`! meta.json 里有 ${meta.images.length} 张配图，已按上限截断为 4 张。`);
}

const contentDir = path.dirname(metaPath);
const outDir = path.join(ROOT, "assets", "images", slug);
const manifestPath = path.join(contentDir, "images.json");
const legacyManifestPath = path.join(outDir, "images.json");
await ensureDir(outDir);
await ensureDir(contentDir);

const API_KEY = process.env.POLLINATIONS_API_KEY || "";
const CLASSIC_BASE = process.env.IMAGE_GEN_BASE || "https://image.pollinations.ai/prompt";
const intervalOverride = Number(process.env.IMAGE_GEN_INTERVAL_MS);
const MIN_INTERVAL = Number.isFinite(intervalOverride)
  ? Math.max(0, intervalOverride)
  : API_KEY
    ? 1200
    : 48_000; // free tier: roughly 1 image / 45s
const cropOverride = Number(process.env.IMAGE_CROP_BOTTOM);
const CROP_BOTTOM = Number.isFinite(cropOverride) ? Math.max(0, cropOverride) : 32;
const MAX_ATTEMPTS = 5;

let lastRequestAt = 0;

function findExistingManifest() {
  if (fs.existsSync(manifestPath)) return manifestPath;
  if (fs.existsSync(legacyManifestPath)) return legacyManifestPath;
  return null;
}

function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function cleanStyle(style) {
  const base = String(style || "bright editorial photography, warm morning light, soft cream and sage palette, quiet everyday life, subtle film grain").trim();
  const additions = [];
  if (!/no text|no letters/i.test(base)) additions.push("no text", "no letters");
  if (!/no watermark/i.test(base)) additions.push("no watermark");
  if (!/no logo/i.test(base)) additions.push("no logo");
  return [base, ...additions].filter(Boolean).join(", ");
}

const style = cleanStyle(meta.imageStyle);

function buildPrompt(spec, kind, index) {
  const scene = String(spec.prompt || "").trim();
  const framing =
    kind === "cover"
      ? "wide 16:9 cover composition, bright airy high-key lighting, clear focal point, generous negative space at the edges"
      : "4:3 editorial inline image, natural composition, medium shot, bright soft light, quiet detail";
  return [scene, framing, style].filter(Boolean).join(", ");
}

function endpoint(prompt, width, height, seed) {
  const encoded = encodeURIComponent(prompt);
  if (API_KEY) {
    return `https://gen.pollinations.ai/image/${encoded}?model=black-forest-labs/flux.1-schnell&width=${width}&height=${height}&seed=${seed}&nologo=true`;
  }
  return `${CLASSIC_BASE.replace(/\/+$/, "")}/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux&enhance=false`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit() {
  if (!lastRequestAt) return;
  const elapsed = Date.now() - lastRequestAt;
  const remaining = MIN_INTERVAL - elapsed;
  if (remaining > 0) {
    console.log(`  等待 ${Math.ceil(remaining / 1000)} 秒，避开免费额度限制…`);
    await sleep(remaining);
  }
}

async function fetchImage(prompt, width, height, seed, label) {
  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    await waitForRateLimit();
    lastRequestAt = Date.now();

    const url = endpoint(prompt, width, height, seed + attempt - 1);
    console.log(`  [${label}] 第 ${attempt} 次请求…`);
    const signal = AbortSignal.timeout(180_000);

    try {
      const headers = {
        "User-Agent": "Mozilla/5.0 (compatible; wechat-writer/1.0; +local)",
        Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8",
      };
      if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
      const res = await fetch(url, { headers, signal, redirect: "follow" });

      const type = (res.headers.get("content-type") || "").toLowerCase();
      if (!res.ok) {
        let detail = "";
        if (type.startsWith("image/")) {
          // The free endpoint sometimes answers 402/429 with an image error
          // page. Never dump those bytes into the terminal.
          await res.arrayBuffer().catch(() => {});
          detail = "接口返回了图片错误页（通常是免费额度限制）";
        } else {
          const text = await res.text().catch(() => "");
          detail = text.slice(0, 240).replace(/\s+/g, " ");
          try {
            const json = JSON.parse(text);
            detail = json.error?.message || json.message || detail;
          } catch {
            // Keep the text preview.
          }
        }
        const retryAfter = Number(res.headers.get("retry-after") || 0);
        const isLimit = res.status === 402 || res.status === 429;
        const waitMs = isLimit
          ? Math.max(retryAfter * 1000, MIN_INTERVAL + 3000, 45_000)
          : Math.min(60_000, 8000 * attempt);
        console.warn(`  [${label}] HTTP ${res.status}：${detail || "请求失败"}；${Math.round(waitMs / 1000)} 秒后重试`);
        if (attempt >= MAX_ATTEMPTS) throw new Error(`图片生成失败：HTTP ${res.status} ${detail}`);
        lastRequestAt = Date.now();
        await sleep(waitMs);
        continue;
      }

      if (!type.startsWith("image/")) {
        const text = await res.text().catch(() => "");
        throw new Error(`返回内容不是图片（${type || "unknown"}）：${text.slice(0, 200)}`);
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 6_000) {
        throw new Error(`图片文件过小（${buf.length} bytes），可能生成失败`);
      }
      return buf;
    } catch (err) {
      const message = err.name === "TimeoutError" || err.name === "AbortError" ? "请求超时" : err.message;
      console.warn(`  [${label}] ${message}`);
      if (attempt >= MAX_ATTEMPTS) throw err;
      const waitMs = Math.min(60_000, 8000 * attempt);
      lastRequestAt = Date.now();
      await sleep(waitMs);
    }
  }
  throw new Error("图片生成失败：超过最大重试次数");
}

function postProcess(rawPath, finalPath, width, height) {
  const script = path.join(ROOT, "scripts", "process-image.py");
  const result = spawnSync(
    "python3",
    [script, rawPath, finalPath, String(width), String(height), String(CROP_BOTTOM)],
    { encoding: "utf8" },
  );
  if (result.status === 0 && fs.existsSync(finalPath)) return true;
  if (result.stderr) {
    console.warn(`  ! 图片后处理失败，保留原始文件：${result.stderr.trim().split("\n").slice(-2).join(" ")}`);
  }
  fs.copyFileSync(rawPath, finalPath);
  return false;
}

async function generateOne({ kind, index, spec, width, height, file }) {
  const prompt = buildPrompt(spec, kind, index);
  const seed = Number(meta.seed || hashString(slug)) + index * 101 + (kind === "cover" ? 7 : 0);
  const finalPath = path.join(ROOT, file);
  const rawPath = path.join(outDir, `.${kind}-${index}.raw`);

  const buf = await fetchImage(prompt, width, height, seed, kind === "cover" ? "封面" : `配图 ${index}`);
  await fsp.writeFile(rawPath, buf);
  const processed = postProcess(rawPath, finalPath, width, height);
  await fsp.rm(rawPath, { force: true });

  const stat = await fsp.stat(finalPath);
  console.log(`  ✓ ${rootRelative(finalPath)}（${Math.round(stat.size / 1024)} KB${processed ? "，已裁掉角标并压缩" : ""}）`);
  return {
    file: rootRelative(finalPath),
    width,
    height,
    alt: String(spec.alt || "").trim(),
    caption: String(spec.caption || "").trim(),
    prompt,
    bytes: stat.size,
  };
}

// If everything is already there, reuse it unless --force or --only is passed.
const existingManifest = findExistingManifest();
if (!force && !only && existingManifest) {
  try {
    const existing = JSON.parse(fs.readFileSync(existingManifest, "utf8"));
    const files = [existing.cover?.file, ...(existing.inline || []).map((img) => img.file)].filter(Boolean);
    const valid =
      existing.slug === slug &&
      files.length === 1 + inlineSpecs.length &&
      files.every((file) => fs.existsSync(path.join(ROOT, file)));
    if (valid) {
      if (existingManifest !== manifestPath) {
        fs.copyFileSync(existingManifest, manifestPath);
        console.log(`· 已把旧的 images.json 从 ${rootRelative(existingManifest)} 移到 ${rootRelative(manifestPath)}`);
      }
      console.log(`✓ 已有 ${files.length} 张图片，直接复用。需要重画请加 --force。`);
      process.exit(0);
    }
  } catch {
    // Corrupt manifest: regenerate.
  }
}

const jobs = [];
if (!only || only === "cover") {
  jobs.push({
    kind: "cover",
    index: 0,
    spec: { ...meta.cover, caption: "" },
    width: 1024,
    height: 608,
    file: `assets/images/${slug}/cover.jpg`,
  });
}
inlineSpecs.forEach((spec, idx) => {
  if (only && String(idx + 1) !== String(only)) return;
  jobs.push({
    kind: "inline",
    index: idx + 1,
    spec,
    width: 1024,
    height: 800,
    file: `assets/images/${slug}/inline-${idx + 1}.jpg`,
  });
});

if (!jobs.length) {
  console.error("没有需要生成的图片。");
  process.exit(1);
}

console.log(`\n开始生成 ${jobs.length} 张图片（${slug}）`);
console.log(`风格：${style}`);
if (CLASSIC_BASE !== "https://image.pollinations.ai/prompt" && !API_KEY) {
  console.log(`图片接口：${CLASSIC_BASE}`);
}
if (!API_KEY) {
  console.log(
    MIN_INTERVAL > 0
      ? `提示：未配置 POLLINATIONS_API_KEY，使用免费额度，单张之间大约等待 ${Math.round(MIN_INTERVAL / 1000)} 秒。\n`
      : "提示：未配置 POLLINATIONS_API_KEY；等待间隔已关闭（仅建议在测试或自建接口时使用）。\n",
  );
} else {
  console.log("提示：使用 POLLINATIONS_API_KEY 认证请求。\n");
}

const result = {
  slug,
  generatedAt: new Date().toISOString(),
  provider: API_KEY
    ? "pollinations-authenticated"
    : CLASSIC_BASE === "https://image.pollinations.ai/prompt"
      ? "pollinations-free"
      : "custom",
  imageStyle: style,
  cover: null,
  inline: [],
};

for (const job of jobs) {
  if (job.kind === "cover") {
    result.cover = await generateOne(job);
  } else {
    result.inline.push(await generateOne(job));
  }
}

// Reuse entries that were not regenerated when --only was used.
if (only && existingManifest) {
  const previous = JSON.parse(fs.readFileSync(existingManifest, "utf8"));
  if (!result.cover && previous.cover) result.cover = previous.cover;
  for (const old of previous.inline || []) {
    if (!result.inline.some((img) => img.file === old.file)) result.inline.push(old);
  }
  result.inline.sort((a, b) => a.file.localeCompare(b.file, "en", { numeric: true }));
}

result.inline = result.inline.slice(0, 4);
await writeJson(manifestPath, result);

console.log(`\n✓ 图片完成：${rootRelative(manifestPath)}`);
console.log(`  封面：${result.cover?.file || "无"}`);
console.log(`  配图：${result.inline.length} 张`);
