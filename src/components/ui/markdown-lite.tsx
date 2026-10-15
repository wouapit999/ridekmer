import type { ReactNode } from "react";

/**
 * Minimal, dependency-free renderer for the subset of Markdown used by contract templates:
 * headings (#, ##), bullet lists (-), paragraphs, **bold**. No raw HTML is ever rendered.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    ),
  );
}

export function MarkdownLite({ source, className }: { source: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-2 list-disc space-y-1 pl-6">
          {list.map((item, i) => (
            <li key={i}>{inline(item, `li-${blocks.length}-${i}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="my-2">
          {inline(para.join(" "), `p-${blocks.length}`)}
        </p>,
      );
      para = [];
    }
  };
  for (const raw of source.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("# ")) {
      flushList();
      flushPara();
      blocks.push(
        // Document headings sit below the page title, so "#" renders as an h2.
        <h2 key={`h1-${blocks.length}`} className="mt-4 mb-2 text-xl font-bold">
          {inline(line.slice(2), `h1-${blocks.length}`)}
        </h2>,
      );
    } else if (line.startsWith("## ")) {
      flushList();
      flushPara();
      blocks.push(
        <h3 key={`h2-${blocks.length}`} className="mt-4 mb-1 text-base font-semibold">
          {inline(line.slice(3), `h2-${blocks.length}`)}
        </h3>,
      );
    } else if (line.startsWith("- ")) {
      flushPara();
      list.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList();
      flushPara();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushList();
  flushPara();
  return <div className={className ?? "text-sm leading-relaxed text-sand-900"}>{blocks}</div>;
}
