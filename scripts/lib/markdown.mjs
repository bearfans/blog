import { escapeAttr, escapeHtml, smartJoin } from "./utils.mjs";

const P_STYLE =
  "margin:0 0 1.5em;font-size:16px;line-height:1.8;color:#333;text-align:justify;word-break:break-word;";
const H2_STYLE =
  "margin:2em 0 0.9em;padding-left:12px;border-left:4px solid #07C160;font-size:19px;line-height:1.5;font-weight:700;color:#1f2328;";
const H3_STYLE =
  "margin:1.7em 0 0.7em;font-size:17px;line-height:1.6;font-weight:700;color:#1f2328;";
const H4_STYLE =
  "margin:1.5em 0 0.6em;font-size:16px;line-height:1.7;font-weight:700;color:#1f2328;";
const QUOTE_STYLE =
  "margin:1.8em 0;padding:1px 18px;border-left:3px solid #d7d9d8;background:#fafafa;color:#666;";
const QUOTE_P_STYLE =
  "margin:1.2em 0;font-size:15px;line-height:1.8;color:#666;text-align:justify;";
const LIST_STYLE =
  "margin:0 0 1.5em 1.15em;padding:0;font-size:16px;line-height:1.8;color:#333;";
const LI_STYLE =
  "margin:0.35em 0;font-size:16px;line-height:1.8;color:#333;";
const HR_STYLE = "border:none;border-top:1px solid #e5e5e5;margin:2em 0;";
const STRONG_STYLE = "font-weight:700;color:#1f2328;";
const LINK_STYLE =
  "color:#07C160;text-decoration:none;border-bottom:1px solid rgba(7,193,96,.28);";
const CODE_STYLE =
  "padding:2px 5px;border-radius:3px;background:#f2f3f5;font-size:15px;color:#c7254e;font-family:Menlo,Consolas,monospace;";
const PRE_STYLE =
  "margin:1.8em 0;padding:16px;border-radius:8px;background:#1f2328;color:#f5f5f5;overflow-x:auto;font-size:14px;line-height:1.7;";
const PRE_CODE_STYLE =
  "font-family:Menlo,Consolas,monospace;font-size:14px;line-height:1.7;color:#f5f5f5;white-space:pre;";

function safeUrl(raw) {
  const url = String(raw || "").trim();
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  return "";
}

function inline(text) {
  const placeholders = [];
  const protect = (html) => {
    const token = `\u0000${placeholders.length}\u0000`;
    placeholders.push(html);
    return token;
  };

  let s = String(text);

  // Inline code first, so its contents are not styled by the other rules.
  s = s.replace(/`([^`\n]+)`/g, (_, code) => {
    return protect(`<code style="${CODE_STYLE}">${escapeHtml(code)}</code>`);
  });

  // Links. WeChat strips most external links, but keeping the text is still useful.
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, label, url) => {
    const href = safeUrl(url);
    if (!href) return label;
    return protect(
      `<a href="${escapeAttr(href)}" style="${LINK_STYLE}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`,
    );
  });

  s = escapeHtml(s);

  s = s.replace(/\*\*([^*\n]+)\*\*/g, `<strong style="${STRONG_STYLE}">$1</strong>`);
  s = s.replace(/__([^_\n]+)__/g, `<strong style="${STRONG_STYLE}">$1</strong>`);
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, `$1<em>$2</em>`);
  s = s.replace(/(^|[^_])_([^_\n]+)_/g, `$1<em>$2</em>`);
  s = s.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  s = s.replace(/ {2,}\n/g, "<br>");
  s = s.replace(/\n/g, "<br>");

  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => placeholders[Number(i)] || "");
  return s;
}

function isBlockStart(line, nextLine) {
  const t = line.trim();
  if (!t) return true;
  if (/^```/.test(t)) return true;
  if (/^\{\{image:\d+\}\}$/.test(t)) return true;
  if (/^#{1,4}\s+/.test(t)) return true;
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) return true;
  if (/^>\s?/.test(line)) return true;
  if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) return true;
  if (nextLine !== undefined && /^\s*(?:=+|-{3,})\s*$/.test(nextLine) && t) return true;
  return false;
}

function stripHtmlComments(md) {
  return String(md).replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Render a deliberately small Markdown subset.
 * Images are handled through standalone {{image:n}} markers so the build step
 * can inline them as base64 (required for a clean WeChat paste).
 */
export function renderMarkdown(markdown, options = {}) {
  const { renderImage = null } = options;
  const warnings = [];
  const lines = stripHtmlComments(String(markdown)).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced code block.
    if (/^```/.test(trimmed)) {
      const lang = trimmed.slice(3).trim();
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      out.push(
        `<pre style="${PRE_STYLE}"><code${lang ? ` data-lang="${escapeAttr(lang)}"` : ""} style="${PRE_CODE_STYLE}">${escapeHtml(code.join("\n"))}</code></pre>`,
      );
      continue;
    }

    // Standalone image marker.
    const imageMatch = trimmed.match(/^\{\{image:(\d+)\}\}$/);
    if (imageMatch) {
      const n = Number(imageMatch[1]);
      if (renderImage) {
        const html = renderImage(n);
        if (html) out.push(html);
        else warnings.push(`图片标记 {{image:${n}}} 没有找到对应图片`);
      } else {
        warnings.push(`图片标记 {{image:${n}}} 未被处理`);
      }
      i += 1;
      continue;
    }

    // Heading. The page title comes from meta.json, so # and ## both map to h2.
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const content = inline(heading[2].trim());
      if (level <= 2) out.push(`<h2 style="${H2_STYLE}">${content}</h2>`);
      else if (level === 3) out.push(`<h3 style="${H3_STYLE}">${content}</h3>`);
      else out.push(`<h4 style="${H4_STYLE}">${content}</h4>`);
      i += 1;
      continue;
    }

    // Horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push(`<hr style="${HR_STYLE}">`);
      i += 1;
      continue;
    }

    // Blockquote.
    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      const paragraphs = quoteLines.join("\n").split(/\n{2,}/).filter(Boolean);
      const html = paragraphs
        .map((p) => `<p style="${QUOTE_P_STYLE}">${inline(smartJoin(p.split("\n")))}</p>`)
        .join("");
      out.push(`<blockquote style="${QUOTE_STYLE}">${html}</blockquote>`);
      continue;
    }

    // List.
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && lines[i].trim()) {
        const item = lines[i].match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
        if (item) {
          items.push(item[1]);
          i += 1;
          continue;
        }
        // Lazy continuation line, indented under the previous item.
        if (/^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1] += "\n" + lines[i].trim();
          i += 1;
          continue;
        }
        break;
      }
      const tag = ordered ? "ol" : "ul";
      const listItems = items
        .map((item) => `<li style="${LI_STYLE}">${inline(smartJoin(item.split("\n")))}</li>`)
        .join("");
      out.push(`<${tag} style="${LIST_STYLE}">${listItems}</${tag}>`);
      continue;
    }

    // Paragraph.
    const paragraph = [];
    while (i < lines.length && !isBlockStart(lines[i], lines[i + 1])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    if (!paragraph.length) {
      // Defensive: never leave the loop stuck.
      paragraph.push(lines[i]);
      i += 1;
    }
    out.push(`<p style="${P_STYLE}">${inline(smartJoin(paragraph))}</p>`);
  }

  return { html: out.join("\n"), warnings };
}
