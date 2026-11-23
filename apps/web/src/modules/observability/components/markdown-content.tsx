import { cn } from "@lens/ui/lib/utils";
import { Fragment, type ReactNode } from "react";

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "code"; language: string; content: string }
  | { type: "blockquote"; lines: string[] }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "hr" }
  | { type: "paragraph"; lines: string[] };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^```([a-zA-Z0-9_-]*)\s*$/;
const HR_RE = /^(?:---+|\*\*\*+|___+)\s*$/;
const UNORDERED_RE = /^\s*[-*+]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+\.\s+(.*)$/;
const BLOCKQUOTE_RE = /^>\s?(.*)$/;
const TABLE_SEP_RE = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/;

export function MarkdownContent(props: { content: string; className?: string; compact?: boolean }) {
  const blocks = parseBlocks(props.content);
  if (blocks.length === 0) return null;

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1 break-words [overflow-wrap:anywhere]",
        props.compact ? "gap-1.5 text-xs leading-5" : "gap-2 text-[13px] leading-5",
        props.className,
      )}
    >
      {blocks.map((block, index) => renderBlock(block, index, props.compact ?? false))}
    </div>
  );
}

export function looksLikeJsonPreview(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  if (trimmed.startsWith('{"') || trimmed.startsWith("[{") || trimmed.startsWith('["')) {
    return true;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const fenceMatch = FENCE_RE.exec(line.trim());
    if (fenceMatch) {
      const language = fenceMatch[1] ?? "";
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE_RE.test((lines[index] ?? "").trim())) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language, content: codeLines.join("\n") });
      continue;
    }

    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1]?.length ?? 1,
        text: headingMatch[2]?.trim() ?? "",
      });
      index += 1;
      continue;
    }

    if (HR_RE.test(line.trim())) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    if (BLOCKQUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const match = BLOCKQUOTE_RE.exec(lines[index] ?? "");
        if (!match) break;
        quoteLines.push(match[1] ?? "");
        index += 1;
      }
      blocks.push({ type: "blockquote", lines: quoteLines });
      continue;
    }

    if (
      line.includes("|") &&
      index + 1 < lines.length &&
      TABLE_SEP_RE.test(lines[index + 1] ?? "")
    ) {
      const headers = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length) {
        const rowLine = lines[index] ?? "";
        if (!rowLine.includes("|") || rowLine.trim() === "") break;
        rows.push(splitTableRow(rowLine));
        index += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const unorderedMatch = UNORDERED_RE.exec(line);
    const orderedMatch = ORDERED_RE.exec(line);
    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const matcher = ordered ? ORDERED_RE : UNORDERED_RE;
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index] ?? "";
        const match = matcher.exec(current);
        if (match) {
          items.push(match[1] ?? "");
          index += 1;
          continue;
        }
        if (current.trim() === "" || isBlockStart(current, lines[index + 1])) break;
        if (items.length > 0 && /^\s{2,}/.test(current)) {
          items[items.length - 1] = `${items[items.length - 1]}\n${current.trim()}`;
          index += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? "";
      if (next.trim() === "" || isBlockStart(next, lines[index + 1])) break;
      paragraphLines.push(next);
      index += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraphLines });
  }

  return blocks;
}

function isBlockStart(line: string, nextLine: string | undefined): boolean {
  return (
    FENCE_RE.test(line.trim()) ||
    HEADING_RE.test(line) ||
    HR_RE.test(line.trim()) ||
    BLOCKQUOTE_RE.test(line) ||
    UNORDERED_RE.test(line) ||
    ORDERED_RE.test(line) ||
    (line.includes("|") && nextLine !== undefined && TABLE_SEP_RE.test(nextLine))
  );
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function renderBlock(block: Block, key: number, compact: boolean): ReactNode {
  switch (block.type) {
    case "heading": {
      const sizeClass =
        block.level <= 2
          ? compact
            ? "text-xs font-semibold text-foreground"
            : "text-sm font-semibold text-foreground"
          : "text-xs font-semibold text-foreground";
      return (
        <p key={key} className={cn("m-0", sizeClass)}>
          {renderInline(block.text)}
        </p>
      );
    }
    case "code":
      return (
        <div key={key} className="min-w-0 max-w-full overflow-hidden rounded-md border bg-muted/40">
          {block.language ? (
            <div className="border-b px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {block.language}
            </div>
          ) : null}
          <pre className="m-0 max-h-96 overflow-auto p-2.5 font-mono text-[11px] leading-5 text-foreground">
            <code>{block.content}</code>
          </pre>
        </div>
      );
    case "blockquote":
      return (
        <blockquote
          key={key}
          className="m-0 grid gap-1 border-l-2 border-border-strong pl-3 text-muted-foreground"
        >
          {block.lines.map((line, lineIndex) => (
            <p key={lineIndex} className="m-0">
              {renderInline(line)}
            </p>
          ))}
        </blockquote>
      );
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          key={key}
          className={cn("m-0 grid gap-1 pl-5", block.ordered ? "list-decimal" : "list-disc")}
        >
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex} className="min-w-0">
              {renderMultilineInline(item)}
            </li>
          ))}
        </ListTag>
      );
    }
    case "table":
      return (
        <div key={key} className="min-w-0 max-w-full overflow-x-auto rounded-md border">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-muted/40">
              <tr>
                {block.headers.map((header, cellIndex) => (
                  <th
                    key={cellIndex}
                    className="border-b px-2.5 py-1.5 font-semibold text-foreground"
                  >
                    {renderInline(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-2.5 py-1.5 align-top">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr key={key} className="my-1 border-border" />;
    case "paragraph":
      return (
        <p key={key} className="m-0 min-w-0">
          {block.lines.map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 ? <br /> : null}
              {renderInline(line)}
            </Fragment>
          ))}
        </p>
      );
  }
}

function renderMultilineInline(text: string): ReactNode {
  const lines = text.split("\n");
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 ? <br /> : null}
      {renderInline(line)}
    </Fragment>
  ));
}

const INLINE_TOKEN_RE =
  /(`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*)/g;

function renderInline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let tokenKey = 0;

  for (const match of text.matchAll(INLINE_TOKEN_RE)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={tokenKey++}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const sep = token.indexOf("](");
      const label = token.slice(1, sep);
      const href = token.slice(sep + 2, -1);
      if (isSafeHref(href)) {
        nodes.push(
          <a
            key={tokenKey++}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
            onClick={(event) => event.stopPropagation()}
          >
            {label}
          </a>,
        );
      } else {
        nodes.push(label);
      }
    } else if (token.startsWith("***") && token.endsWith("***")) {
      nodes.push(
        <strong key={tokenKey++} className="font-semibold">
          <em>{token.slice(3, -3)}</em>
        </strong>,
      );
    } else if (
      (token.startsWith("**") && token.endsWith("**")) ||
      (token.startsWith("__") && token.endsWith("__"))
    ) {
      nodes.push(
        <strong key={tokenKey++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("~~") && token.endsWith("~~")) {
      nodes.push(
        <del key={tokenKey++} className="text-muted-foreground">
          {token.slice(2, -2)}
        </del>,
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={tokenKey++}>{token.slice(1, -1)}</em>);
    } else {
      nodes.push(token);
    }

    lastIndex = start + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length === 1 ? nodes[0] : nodes;
}

function isSafeHref(href: string): boolean {
  const lower = href.trim().toLowerCase();
  return lower.startsWith("https://") || lower.startsWith("http://") || lower.startsWith("mailto:");
}
