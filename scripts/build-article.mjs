#!/usr/bin/env node
/**
 * Build one article page, update the manifest, and keep index.html in sync.
 *
 * Usage:
 *   node scripts/build-article.mjs content/<slug>
 *   node scripts/build-article.mjs --all
 *   node scripts/build-article.mjs --index
 *
 * Flags:
 *   --no-index      Don't touch index.html (useful for a fully custom homepage)
 *   --force-index   Back up a custom index.html and regenerate it
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  ROOT,
  countWords,
  ensureDir,
  escapeAttr,
  escapeHtml,
  existsSync,
  formatDateLong,
  formatDateShort,
  nowStamp,
  parseDate,
  readingMinutes,
  rootRelative,
  svgIcon,
  toPosix,
  writeJson,
} from "./lib/utils.mjs";
import { renderMarkdown } from "./lib/markdown.mjs";

const SITE_DEFAULTS = {
  title: "慢慢写",
  eyebrow: "WRITING · NOTES",
  subtitle: "把日子里的想法，写成有人味儿的文章",
  description: "一个用文字记录生活与思考的地方。",
  author: "慢慢写",
  footer: "文字是慢的，但会留下来。",
};

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const contentArg = args.find((a) => !a.startsWith("--"));
const rebuildAll = flags.has("--all");
const indexOnly = flags.has("--index");
const noIndex = flags.has("--no-index");
const forceIndex = flags.has("--force-index");

const sitePath = path.join(ROOT, "site.json");
const manifestPath = path.join(ROOT, "articles.json");
const indexPath = path.join(ROOT, "index.html");
const templatesDir = path.join(ROOT, "templates");

if (!rebuildAll && !indexOnly && !contentArg) {
  console.error("用法：node scripts/build-article.mjs content/<slug> | --all | --index [--no-index] [--force-index]");
  process.exit(1);
}

function readSite() {
  const site = existsSync(sitePath) ? JSON.parse(fs.readFileSync(sitePath, "utf8")) : {};
  return { ...SITE_DEFAULTS, ...site };
}

function siteBase(site) {
  return String(site.url || "").trim().replace(/\/+$/, "");
}

function siteUrl(site, pathname = "") {
  const base = siteBase(site);
  const rel = String(pathname).replace(/^\/+/, "");
  if (base) return rel ? `${base}/${rel}` : `${base}/`;
  return rel ? `/${rel}` : "/";
}

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function inlineJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function socialImageTags(site, image, alt = "") {
  if (!image) return "";
  const url = escapeAttr(siteUrl(site, image));
  const altTag = alt ? `\n<meta property="og:image:alt" content="${escapeAttr(alt)}">` : "";
  return `<meta property="og:image" content="${url}">${altTag}
<meta name="twitter:image" content="${url}">`;
}

function renderSitemap(manifest, site) {
  const base = siteBase(site);
  if (!base) return "";
  const sorted = sortManifest(manifest);
  const newest = sorted.reduce((max, entry) => {
    return Math.max(max, parseDate(entry.updatedAt || entry.date).getTime());
  }, 0);
  const urls = [
    `  <url>\n    <loc>${escapeXml(`${base}/`)}</loc>\n    <lastmod>${new Date(newest || Date.now()).toISOString()}</lastmod>\n  </url>`,
    ...sorted.map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(`${base}/${entry.path}`)}</loc>\n    <lastmod>${parseDate(entry.updatedAt || entry.date).toISOString()}</lastmod>\n  </url>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

async function writePublishingFiles(manifest, site) {
  const base = siteBase(site);
  const robots = `User-agent: *
Allow: /
${base ? `\nSitemap: ${base}/sitemap.xml\n` : ""}`;
  await fsp.writeFile(path.join(ROOT, "robots.txt"), robots, "utf8");

  if (!base) {
    console.log("· site.json 未配置 url，已跳过 sitemap.xml 与 CNAME 生成");
    return;
  }

  let host;
  try {
    host = new URL(base).host;
  } catch {
    throw new Error(`site.json 的 url 不是合法地址：${base}`);
  }

  await fsp.writeFile(path.join(ROOT, "sitemap.xml"), renderSitemap(manifest, site), "utf8");
  await fsp.writeFile(path.join(ROOT, "CNAME"), `${host}\n`, "utf8");
}

function readManifest() {
  if (!existsSync(manifestPath)) return [];
  const text = fs.readFileSync(manifestPath, "utf8");
  if (!text.trim()) return [];
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.articles)) return data.articles;
  return [];
}

function sortManifest(list) {
  return [...list].sort((a, b) => {
    const da = parseDate(a.date).getTime();
    const db = parseDate(b.date).getTime();
    if (db !== da) return db - da;
    return String(b.slug).localeCompare(String(a.slug));
  });
}

async function writeManifest(list) {
  await writeJson(manifestPath, sortManifest(list));
}

function fillTemplate(template, values) {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.replaceAll(`{{${key}}}`, value == null ? "" : String(value));
  }
  return out;
}

function excerpt(markdown, max = 96) {
  const plain = String(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\{\{image:\d+\}\}/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~\-|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function inlineImage(img, index, warnings) {
  if (!img?.file) {
    warnings.push(`第 ${index} 张配图缺少 file 字段`);
    return "";
  }
  const abs = path.join(ROOT, img.file);
  if (!existsSync(abs)) {
    warnings.push(`第 ${index} 张配图不存在：${img.file}`);
    return "";
  }
  const data = fs.readFileSync(abs).toString("base64");
  const mime = mimeFor(abs);
  const alt = escapeAttr(img.alt || "");
  const caption = String(img.caption || "").trim();
  const captionHtml = caption
    ? `<p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#999;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(caption)}</p>`
    : "";
  return `<section style="margin:2em 0;"><img src="data:${mime};base64,${data}" alt="${alt}" style="width:100%;height:auto;border-radius:8px;display:block;">${captionHtml}</section>`;
}

function imageRenderer(images, warnings, used) {
  const map = new Map();
  (images.inline || []).forEach((img, idx) => map.set(idx + 1, img));
  return (n) => {
    const img = map.get(n);
    if (!img) {
      warnings.push(`article.md 引用了 {{image:${n}}}，但 images.json 里没有第 ${n} 张配图`);
      return "";
    }
    if (used.has(n)) {
      warnings.push(`{{image:${n}}} 被重复引用，已忽略重复项`);
      return "";
    }
    used.add(n);
    return inlineImage(img, n, warnings);
  };
}

function renderTags(tags, className = "tag") {
  return (Array.isArray(tags) ? tags : [])
    .filter(Boolean)
    .slice(0, 5)
    .map((tag) => `<span class="${className}">${escapeHtml(tag)}</span>`)
    .join("");
}

function renderTagsInline(tags) {
  return (Array.isArray(tags) ? tags : [])
    .filter(Boolean)
    .slice(0, 5)
    .map(
      (tag) =>
        `<span style="display:inline-block;padding:4px 8px;border-radius:6px;background:#f2f5f3;color:#4f5953;font-size:11.5px;line-height:1.4;">${escapeHtml(tag)}</span>`,
    )
    .join("");
}

function renderCard(entry, index) {
  const latest = index === 0 ? '<span class="latest">最新</span>' : "";
  const tags = renderTags(entry.tags);
  const priority = index === 0 ? ' fetchpriority="high"' : "";
  return `<article class="card" data-article="${escapeAttr(entry.slug)}">
  <a href="${escapeAttr(entry.path)}">
    <div class="card-cover">
      <img src="${escapeAttr(entry.cover)}" alt="${escapeAttr(entry.coverAlt || entry.title)}" loading="${index < 3 ? "eager" : "lazy"}"${priority} decoding="async">
    </div>
    <div class="card-body">
      <div class="card-meta">
        ${latest}
        <time datetime="${escapeAttr(entry.date)}">${escapeHtml(formatDateShort(entry.date))}</time>
        <span>·</span>
        <span>${entry.readTime || 1} 分钟</span>
      </div>
      <h2 class="card-title">${escapeHtml(entry.title)}</h2>
      <p class="card-summary">${escapeHtml(entry.summary || "")}</p>
      <div class="card-tags">${tags}</div>
      <span class="card-more">阅读全文 ${svgIcon("arrow")}</span>
    </div>
  </a>
</article>`;
}

function renderStandaloneCard(entry) {
  const tags = renderTagsInline(entry.tags);
  return `<article data-article="${escapeAttr(entry.slug)}" style="break-inside:avoid;margin:0 0 24px;background:#fff;border:1px solid rgba(31,35,40,.08);border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(31,35,40,.05);">
  <a href="${escapeAttr(entry.path)}" style="display:block;color:inherit;text-decoration:none;">
    <div style="aspect-ratio:16/9;background:#e7e9e8;overflow:hidden;">
      <img src="${escapeAttr(entry.cover)}" alt="${escapeAttr(entry.coverAlt || entry.title)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;">
    </div>
    <div style="padding:20px 21px 22px;">
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;color:#8a9097;font-size:11.5px;line-height:1.5;">
        <span style="display:inline-flex;padding:3px 8px;border-radius:999px;background:#07c160;color:#fff;font-size:10.5px;font-weight:700;">新文章</span>
        <time datetime="${escapeAttr(entry.date)}">${escapeHtml(formatDateShort(entry.date))}</time>
        <span>·</span><span>${entry.readTime || 1} 分钟</span>
      </div>
      <h2 style="margin:13px 0 10px;font-size:21px;line-height:1.45;font-weight:760;color:#1b1f23;">${escapeHtml(entry.title)}</h2>
      <p style="margin:0 0 16px;color:#626970;font-size:14px;line-height:1.8;">${escapeHtml(entry.summary || "")}</p>
      <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px;">${tags}</div>
      <span style="display:inline-flex;align-items:center;gap:7px;color:#06ad56;font-size:13px;font-weight:700;">阅读全文 ${svgIcon("arrow")}</span>
    </div>
  </a>
</article>`;
}

function renderIndex(manifest, site) {
  const template = fs.readFileSync(path.join(templatesDir, "index.html"), "utf8");
  const sorted = sortManifest(manifest);
  const cards = sorted.length
    ? sorted.map((entry, index) => renderCard(entry, index)).join("\n")
    : `<section class="empty">
  <h2>还没有文章</h2>
  <p>把主题或概要发给写作 Agent，第一篇文章就会出现在这里。</p>
</section>`;
  const latest = sorted[0];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: site.title,
    description: site.description,
    url: siteUrl(site),
    inLanguage: "zh-CN",
    blogPost: sorted.map((entry) => ({
      "@type": "BlogPosting",
      headline: entry.title,
      description: entry.summary || "",
      url: siteUrl(site, entry.path),
      datePublished: parseDate(entry.date).toISOString(),
      ...(entry.cover ? { image: siteUrl(site, entry.cover) } : {}),
    })),
  };
  return fillTemplate(template, {
    SITE_TITLE: escapeHtml(site.title),
    SITE_EYEBROW: escapeHtml(site.eyebrow),
    SITE_SUBTITLE: escapeHtml(site.subtitle),
    SITE_DESCRIPTION: escapeHtml(site.description),
    SITE_FOOTER: escapeHtml(site.footer),
    SITE_AUTHOR: escapeHtml(site.author),
    SITE_URL: siteBase(site),
    ARTICLE_COUNT: String(sorted.length),
    LATEST_DATE: sorted.length ? formatDateShort(sorted[0].date) : "暂无",
    CARDS: cards,
    SOCIAL_IMAGE_TAGS: socialImageTags(site, latest?.cover, latest?.coverAlt || latest?.title),
    JSON_LD: inlineJson(jsonLd),
  });
}

async function writeGeneratedIndex(manifest, site) {
  await fsp.writeFile(indexPath, renderIndex(manifest, site), "utf8");
}

function backupIndex() {
  const backup = path.join(ROOT, `index.html.bak-${nowStamp()}`);
  fs.copyFileSync(indexPath, backup);
  return backup;
}

function isGeneratedIndex(html) {
  return /<meta\s+name=["']generator["']\s+content=["']slow-writer["']/i.test(html);
}

function injectCardIntoCustomIndex(html, entry) {
  const slug = entry.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let next = html.replace(
    new RegExp(`<article[^>]*data-article=["']${slug}["'][\\s\\S]*?<\\/article>`, "gi"),
    "",
  );

  const containerPatterns = [
    /<(main|div|section)([^>]*\bid=["']article-grid["'][^>]*)>/i,
    /<(main|div|section)([^>]*\bclass=["'][^"']*(?:masonry|article-list|article-cards|post-list)[^"']*["'][^>]*)>/i,
  ];

  for (const pattern of containerPatterns) {
    const match = next.match(pattern);
    if (!match) continue;
    const insertAt = match.index + match[0].length;
    next = `${next.slice(0, insertAt)}\n${renderStandaloneCard(entry)}${next.slice(insertAt)}`;
    return { html: next, injected: true };
  }
  return { html, injected: false };
}

async function updateIndex(manifest, site, entry) {
  if (noIndex) {
    console.log("· 已跳过 index.html 更新（--no-index）");
    return;
  }

  if (!existsSync(indexPath) || (flags.has("--index") && !existsSync(indexPath))) {
    await writeGeneratedIndex(manifest, site);
    console.log("✓ 已生成 index.html（瀑布流首页）");
    return;
  }

  const html = fs.readFileSync(indexPath, "utf8");

  if (isGeneratedIndex(html)) {
    await writeGeneratedIndex(manifest, site);
    console.log("✓ 已更新 index.html（新卡片已按时间排在前面）");
    return;
  }

  if (forceIndex) {
    const backup = backupIndex();
    await writeGeneratedIndex(manifest, site);
    console.log(`✓ 已备份原首页并重新生成：${rootRelative(backup)}`);
    return;
  }

  if (entry) {
    const result = injectCardIntoCustomIndex(html, entry);
    if (result.injected) {
      await fsp.writeFile(indexPath, result.html, "utf8");
      console.log("✓ 检测到自定义 index.html，已把新文章卡片插入文章列表顶部");
      return;
    }
  }

  console.warn("! 检测到自定义 index.html，但没有找到 article-grid / masonry 列表容器。");
  console.warn("! 首页未被修改。请手动添加卡片，或加 --force-index 让工具重建首页。");
}

async function buildOne(contentDir) {
  const metaPath = path.join(contentDir, "meta.json");
  const articlePath = path.join(contentDir, "article.md");

  if (!existsSync(metaPath)) {
    throw new Error(`缺少 meta.json：${rootRelative(metaPath)}。请先写文章元数据。`);
  }
  if (!existsSync(articlePath)) {
    throw new Error(`缺少 article.md：${rootRelative(articlePath)}。请先写正文。`);
  }

  const meta = JSON.parse(await fsp.readFile(metaPath, "utf8"));
  if (!meta.title) throw new Error("meta.json 缺少 title。");
  if (!meta.slug) throw new Error("meta.json 缺少 slug。");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(meta.slug)) {
    throw new Error(`slug 只能使用小写字母、数字和连字符：${meta.slug}`);
  }

  const contentImagesPath = path.join(contentDir, "images.json");
  const legacyImagesPath = path.join(ROOT, "assets", "images", meta.slug, "images.json");
  const imagesPath = existsSync(contentImagesPath) ? contentImagesPath : legacyImagesPath;
  if (!existsSync(imagesPath)) {
    throw new Error(
      `缺少 images.json：${rootRelative(contentImagesPath)}（也检查了 ${rootRelative(legacyImagesPath)}）。请先生成图片。`,
    );
  }
  if (imagesPath === legacyImagesPath) {
    await fsp.copyFile(legacyImagesPath, contentImagesPath);
    console.log(`· 已把旧 images.json 复制到 ${rootRelative(contentImagesPath)}`);
  }

  const markdown = await fsp.readFile(articlePath, "utf8");
  const images = JSON.parse(await fsp.readFile(imagesPath, "utf8"));

  if (!images.cover?.file) throw new Error("images.json 缺少封面图。");
  if (!existsSync(path.join(ROOT, images.cover.file))) {
    throw new Error(`封面图不存在：${images.cover.file}`);
  }
  if (Array.isArray(images.inline) && images.inline.length > 4) {
    console.warn(`! images.json 里有 ${images.inline.length} 张配图，只使用前 4 张。`);
    images.inline = images.inline.slice(0, 4);
  }
  for (const [index, img] of (images.inline || []).entries()) {
    if (!img?.file) throw new Error(`images.json 第 ${index + 1} 张配图缺少 file 字段。`);
    if (!existsSync(path.join(ROOT, img.file))) {
      throw new Error(`第 ${index + 1} 张配图不存在：${img.file}`);
    }
  }

  const date = meta.date || new Date().toISOString();
  const warnings = [];
  const usedImages = new Set();
  const renderImage = imageRenderer(images, warnings, usedImages);
  const rendered = renderMarkdown(markdown, { renderImage });
  warnings.push(...rendered.warnings);

  let contentHtml = rendered.html;
  if (/\{\{image:\d+\}\}/.test(contentHtml)) {
    warnings.push("正文里还有未被替换的 {{image:n}}，请确认它是否单独占一行");
  }
  const unused = (images.inline || [])
    .map((img, idx) => ({ img, n: idx + 1 }))
    .filter(({ n }) => !usedImages.has(n));

  if (unused.length) {
    warnings.push(
      `有 ${unused.length} 张配图没有在 article.md 中用 {{image:n}} 放置，已自动补在文末`,
    );
    contentHtml += `\n<hr style="border:none;border-top:1px solid #e5e5e5;margin:2.2em 0;">\n`;
    contentHtml += unused
      .map(({ img, n }) => inlineImage(img, n, warnings))
      .filter(Boolean)
      .join("\n");
  }

  const tags = Array.isArray(meta.tags) ? meta.tags.filter(Boolean).slice(0, 5) : [];
  const title = String(meta.title).trim();
  const summary = String(meta.summary || excerpt(markdown)).trim();
  const site = readSite();
  const author = String(meta.author || site.author || "佚名").trim();
  const words = countWords(markdown);
  const readTime = readingMinutes(words);
  const cover = toPosix(path.join("..", images.cover.file));
  const coverAlt = images.cover.alt || title;
  const kicker = String(meta.kicker || tags[0] || "随笔").trim();
  const publishedIso = parseDate(date).toISOString();
  const modifiedIso = new Date().toISOString();
  const canonical = siteUrl(site, `articles/${meta.slug}.html`);
  const template = await fsp.readFile(path.join(templatesDir, "article.html"), "utf8");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description: summary,
    datePublished: publishedIso,
    dateModified: modifiedIso,
    author: { "@type": "Person", name: author },
    image: [siteUrl(site, images.cover.file)],
    url: canonical,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    inLanguage: "zh-CN",
    wordCount: words,
    articleSection: kicker,
    ...(tags.length ? { keywords: tags.join(", ") } : {}),
  };

  const html = fillTemplate(template, {
    TITLE: escapeHtml(title),
    SUMMARY: escapeHtml(summary),
    AUTHOR: escapeHtml(author),
    CANONICAL: escapeAttr(canonical),
    DATE: escapeHtml(formatDateLong(date)),
    DATE_ISO: escapeAttr(publishedIso),
    DATE_MODIFIED_ISO: escapeAttr(modifiedIso),
    WORD_COUNT: String(words),
    READ_TIME: String(readTime),
    KICKER: escapeHtml(kicker),
    TAGS: renderTags(tags),
    ARTICLE_TAG_META: tags
      .map((tag) => `<meta property="article:tag" content="${escapeAttr(tag)}">`)
      .join("\n"),
    COVER: escapeAttr(cover),
    COVER_ALT: escapeAttr(coverAlt),
    CONTENT: contentHtml,
    SITE_TITLE: escapeHtml(site.title),
    SITE_FOOTER: escapeHtml(site.footer),
    SOCIAL_IMAGE_TAGS: socialImageTags(site, images.cover.file, coverAlt),
    JSON_LD: inlineJson(jsonLd),
  });

  const outPath = path.join(ROOT, "articles", `${meta.slug}.html`);
  await ensureDir(path.dirname(outPath));
  await fsp.writeFile(outPath, html, "utf8");

  const entry = {
    slug: meta.slug,
    title,
    summary,
    date: publishedIso,
    author,
    tags,
    cover: images.cover.file,
    coverAlt,
    path: `articles/${meta.slug}.html`,
    wordCount: words,
    readTime,
    imageCount: 1 + (images.inline || []).length,
    updatedAt: modifiedIso,
  };

  return { entry, warnings, outPath, words, readTime };
}

async function buildAll() {
  const contentRoot = path.join(ROOT, "content");
  if (!existsSync(contentRoot)) throw new Error("content/ 目录不存在。");
  const dirs = (await fsp.readdir(contentRoot, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => path.join(contentRoot, d.name))
    .filter((dir) => existsSync(path.join(dir, "meta.json")))
    .sort();

  if (!dirs.length) {
    console.log("content/ 下还没有文章。");
    return;
  }

  const manifest = readManifest();
  const site = readSite();
  const built = [];

  for (const dir of dirs) {
    try {
      const result = await buildOne(dir);
      const existingIndex = manifest.findIndex((entry) => entry.slug === result.entry.slug);
      if (existingIndex >= 0) manifest.splice(existingIndex, 1);
      manifest.push(result.entry);
      built.push(result);
      console.log(`✓ ${result.entry.slug} → ${rootRelative(result.outPath)}（${result.words} 字）`);
      result.warnings.forEach((warning) => console.warn(`  ! ${warning}`));
    } catch (err) {
      console.error(`✗ ${rootRelative(dir)}：${err.message}`);
    }
  }

  await writeManifest(manifest);
  await updateIndex(sortManifest(manifest), site);
  await writePublishingFiles(manifest, site);
  console.log(`\n完成：${built.length} 篇文章。`);
}

async function main() {
  const site = readSite();

  if (indexOnly) {
    const manifest = sortManifest(readManifest());
    if (existsSync(indexPath) && !isGeneratedIndex(fs.readFileSync(indexPath, "utf8"))) {
      const backup = backupIndex();
      console.log(`· 已备份自定义首页：${rootRelative(backup)}`);
    }
    await writeGeneratedIndex(manifest, site);
    await writePublishingFiles(manifest, site);
    console.log(`✓ 已重建 index.html（${manifest.length} 篇文章）`);
    return;
  }

  if (rebuildAll) {
    await buildAll();
    return;
  }

  const contentDir = path.resolve(ROOT, contentArg);
  const contentRoot = path.join(ROOT, "content") + path.sep;
  if (!contentDir.startsWith(contentRoot) && contentDir !== path.join(ROOT, "content")) {
    throw new Error("文章目录必须位于 content/ 下，例如 content/my-article");
  }

  const result = await buildOne(contentDir);
  const manifest = readManifest().filter((entry) => entry.slug !== result.entry.slug);
  manifest.push(result.entry);
  const sorted = sortManifest(manifest);
  await writeManifest(sorted);
  await updateIndex(sorted, site, result.entry);
  await writePublishingFiles(sorted, site);

  console.log(`\n✓ 文章页面：${rootRelative(result.outPath)}`);
  console.log(`✓ 目录清单：articles.json（${sorted.length} 篇，最新在前）`);
  console.log(`✓ 字数：${result.words} 字，约 ${result.readTime} 分钟`);
  console.log(`✓ 图片：${result.entry.imageCount} 张（1 张封面 + ${result.entry.imageCount - 1} 张配图）`);
  result.warnings.forEach((warning) => console.warn(`! ${warning}`));
  console.log(`\n预览：打开 ${rootRelative(result.outPath)}，点击文末的复制图标即可复制正文。`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
