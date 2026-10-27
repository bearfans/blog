#!/usr/bin/env node
/**
 * Verify that an article page, its images, the manifest, and the homepage card
 * all line up. Exits non-zero on a real problem.
 *
 * Usage:
 *   node agent/scripts/verify-article.mjs content/<slug>
 *   node agent/scripts/verify-article.mjs <slug>
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, escapeHtml, existsSync, parseDate, rootRelative } from "./lib/utils.mjs";

const arg = process.argv[2];
if (!arg) {
  console.error("用法：node agent/scripts/verify-article.mjs content/<slug>");
  process.exit(1);
}

const contentDir = arg.includes(path.sep) || arg.startsWith("content/")
  ? path.resolve(ROOT, arg)
  : path.join(ROOT, "content", arg);

const problems = [];
const warnings = [];
const ok = [];

function fail(message) {
  problems.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    fail(`无法读取 ${rootRelative(file)}：${err.message}`);
    return null;
  }
}

function dateMs(value) {
  try {
    return parseDate(value).getTime();
  } catch {
    return Number.NaN;
  }
}

const meta = readJson(path.join(contentDir, "meta.json"));
if (!meta) {
  report();
  process.exit(1);
}

const slug = meta.slug;
if (!slug) {
  fail("meta.json 缺少 slug");
  report();
  process.exit(1);
}

const contentImagesPath = path.join(contentDir, "images.json");
const legacyImagesPath = path.join(ROOT, "assets", "images", slug, "images.json");
const imagesPath = existsSync(contentImagesPath) ? contentImagesPath : legacyImagesPath;
if (!existsSync(imagesPath)) {
  fail(`缺少 images.json：${rootRelative(contentImagesPath)}`);
  report();
  process.exit(1);
}
const images = readJson(imagesPath);
if (!images) {
  report();
  process.exit(1);
}
const pagePath = path.join(ROOT, "articles", `${slug}.html`);
const indexPath = path.join(ROOT, "index.html");
const manifestPath = path.join(ROOT, "articles.json");

if (!existsSync(pagePath)) {
  fail(`文章页不存在：${rootRelative(pagePath)}`);
  report();
  process.exit(1);
}

const page = fs.readFileSync(pagePath, "utf8");
const titleEscaped = escapeHtml(String(meta.title || ""));

if (!page.includes('id="article-content"')) fail("文章页缺少 #article-content");
if (!page.includes('id="copy-btn"')) fail("文章页缺少 #copy-btn 复制按钮");
if (!page.includes('href="../index.html"')) fail("文章页缺少返回首页链接");
if (!page.includes(titleEscaped)) fail("文章页里找不到 meta.json 的标题");
if (images.cover?.file && !page.includes(`../${images.cover.file}`)) {
  fail("文章页没有引用正确的封面图");
}
if (!page.includes('name="generator" content="slow-writer"')) {
  warn("文章页没有 slow-writer 的 generator 标记");
}

const leftover = page.match(/\{\{(?:TITLE|SUMMARY|AUTHOR|DATE|DATE_ISO|WORD_COUNT|READ_TIME|KICKER|TAGS|COVER|COVER_ALT|CONTENT|SITE_TITLE|SITE_FOOTER)\}\}/g);
if (leftover) fail(`文章页仍有未替换的模板变量：${[...new Set(leftover)].join(", ")}`);
if (/\{\{image:\d+\}\}/.test(page)) fail("文章页仍有未替换的 {{image:n}} 标记");

const inlineImages = Array.isArray(images.inline) ? images.inline.slice(0, 4) : [];
if (!images.cover?.file || !existsSync(path.join(ROOT, images.cover.file))) {
  fail("封面图不存在");
}
for (const [idx, img] of inlineImages.entries()) {
  if (!img.file || !existsSync(path.join(ROOT, img.file))) {
    fail(`第 ${idx + 1} 张配图不存在：${img.file || "(空)"}`);
  }
}
const totalImages = (images.cover?.file ? 1 : 0) + inlineImages.length;
if (totalImages < 1 || totalImages > 5) fail(`图片总数必须在 1–5 张之间，当前 ${totalImages} 张`);

const embedded = page.match(/data:image\/(?:jpeg|png|webp|gif);base64,/g) || [];
if (embedded.length < inlineImages.length) {
  fail(`正文内嵌图片数量不足：期望至少 ${inlineImages.length} 张，实际 ${embedded.length} 张`);
}
ok.push(`文章页结构正常，内嵌 ${embedded.length} 张正文图`);

const sizeMb = Buffer.byteLength(page, "utf8") / 1024 / 1024;
if (sizeMb > 8) warn(`文章页体积较大（${sizeMb.toFixed(1)} MB），复制可能变慢`);
ok.push(`图片共 ${totalImages} 张（1 张封面 + ${inlineImages.length} 张正文图）`);

// Manifest and homepage.
if (!existsSync(manifestPath)) {
  fail("articles.json 不存在");
} else {
  const raw = readJson(manifestPath);
  const manifest = Array.isArray(raw) ? raw : Array.isArray(raw?.articles) ? raw.articles : [];
  const entry = manifest.find((item) => item.slug === slug);
  if (!entry) {
    fail("articles.json 里没有这篇文章");
  } else {
    if (entry.path !== `articles/${slug}.html`) fail("articles.json 的 path 不正确");
    if (Number.isNaN(dateMs(entry.date))) fail("articles.json 的 date 无法解析");
    ok.push("articles.json 已收录这篇文章");
  }
  const dates = manifest.map((item) => dateMs(item.date));
  if (dates.some((n) => Number.isNaN(n))) {
    fail("articles.json 里有无法解析的日期");
  } else if (dates.some((n, i) => i > 0 && n > dates[i - 1])) {
    fail("articles.json 没有按日期倒序排列");
  } else {
    ok.push("articles.json 按最新在前排序");
  }

  if (!existsSync(indexPath)) {
    fail("index.html 不存在");
  } else {
    const index = fs.readFileSync(indexPath, "utf8");
    if (!index.includes(`data-article="${slug}"`)) {
      fail("首页没有这篇文章的卡片");
    } else {
      ok.push("首页卡片存在");
    }
    if (!index.includes(`href="articles/${slug}.html"`)) {
      fail("首页卡片没有链接到文章页");
    }

    const isNewest = manifest.length > 0 && manifest[0].slug === slug;
    if (isNewest) {
      const positions = [...index.matchAll(/data-article="([^"]+)"/g)].map((m) => ({
        slug: m[1],
        at: m.index,
      }));
      const current = positions.find((p) => p.slug === slug);
      const before = positions.filter((p) => p.at < (current?.at ?? -1));
      if (!current) {
        fail("首页找不到最新文章的卡片");
      } else if (before.length > 0) {
        fail("最新文章没有排在首页最上面");
      } else {
        ok.push("最新文章位于首页顶部");
      }
    }
  }
}

report();

function report() {
  for (const message of ok) console.log(`✓ ${message}`);
  for (const message of warnings) console.warn(`! ${message}`);
  for (const message of problems) console.error(`✗ ${message}`);
  if (problems.length) {
    console.error(`\n验收未通过：${problems.length} 个问题`);
    process.exitCode = 1;
  } else {
    console.log("\n验收通过。");
  }
}
