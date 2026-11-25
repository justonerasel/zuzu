import React, { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { getNativeZuzuPlugin } from '../utils/permission';

interface MarkdownMessageProps {
  text: string;
  isStreaming?: boolean;
}

function isSafeHttpUrl(rawUrl: string): boolean {
  return /^https?:\/\/\S+$/i.test(rawUrl.trim());
}

function openExternalSafely(e: React.MouseEvent, url: string) {
  const nativePlugin = getNativeZuzuPlugin();
  if (nativePlugin?.openExternalUrl) {
    e.preventDefault();
    nativePlugin.openExternalUrl({ url }).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }
}

/**
 * Renders inline Markdown safely: **bold**, *italic*, `code`, [label](url), bare URLs.
 */
function renderInlineNodes(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRegex =
    /(`[^`\n]+`|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>()]+)/g;

  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let seg = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${seg++}`;

    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-purple-950/60 border border-purple-500/25 text-purple-200 font-mono text-[11px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-white">
          {renderInlineNodes(token.slice(2, -2), `${key}-b`)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      nodes.push(
        <em key={key} className="italic text-slate-200">
          {renderInlineNodes(token.slice(1, -1), `${key}-i`)}
        </em>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (linkMatch && isSafeHttpUrl(linkMatch[2])) {
        nodes.push(
          <a
            key={key}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => openExternalSafely(e, linkMatch[2])}
            className="inline-flex items-center gap-0.5 text-purple-300 hover:text-purple-200 underline underline-offset-2 decoration-purple-400/50"
          >
            <span>{linkMatch[1]}</span>
            <ExternalLink className="w-2.5 h-2.5 inline flex-shrink-0" />
          </a>
        );
      } else {
        nodes.push(token);
      }
    } else if (isSafeHttpUrl(token)) {
      const cleanUrl = token.replace(/[.,;:!?)]+$/, '');
      const trailing = token.slice(cleanUrl.length);
      nodes.push(
        <React.Fragment key={key}>
          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => openExternalSafely(e, cleanUrl)}
            className="text-purple-300 hover:text-purple-200 underline underline-offset-2 break-all"
          >
            {cleanUrl}
          </a>
          {trailing}
        </React.Fragment>
      );
    } else {
      nodes.push(token);
    }

    lastIdx = match.index + token.length;
  }

  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }

  return nodes;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutEdges = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return withoutEdges.split('|').map(cell => cell.trim());
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const cells = splitTableRow(trimmed);
  return cells.length > 0 && cells.every(c => /^:?-{2,}:?$/.test(c));
}

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="my-2 rounded-xl overflow-hidden border border-purple-500/25 bg-[#080b13]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-purple-950/35 border-b border-purple-500/20 text-[10px]">
        <span className="font-mono uppercase tracking-wider text-purple-300">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopyCode}
          className="inline-flex items-center gap-1 text-slate-300 hover:text-white transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[11px] leading-relaxed font-mono text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ text, isStreaming }) => {
  const normalized = String(text || '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: React.ReactNode[] = [];

  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // 1. Fenced Code Block ```lang ... ```
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i++;
      }
      blocks.push(
        <CodeBlock key={`blk-${blockKey++}`} language={lang} code={codeLines.join('\n')} />
      );
      continue;
    }

    // 2. Markdown Table (| col | col |) with separator line
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      const headers = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length) {
        const rowLine = lines[i].trim();
        if (!rowLine || !rowLine.includes('|') || rowLine.startsWith('```')) break;
        rows.push(splitTableRow(rowLine));
        i++;
      }

      blocks.push(
        <div
          key={`blk-${blockKey++}`}
          className="my-2 overflow-x-auto rounded-xl border border-purple-500/25 bg-[#090c15]"
        >
          <table className="w-full min-w-[340px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="bg-purple-500/15 border-b border-purple-500/25">
                {headers.map((h, hIdx) => (
                  <th
                    key={hIdx}
                    className="px-3 py-2 font-semibold text-purple-200 whitespace-nowrap"
                  >
                    {renderInlineNodes(h, `th-${blockKey}-${hIdx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((cells, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-white/[0.02]' : ''}>
                  {headers.map((_, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-slate-200 align-top">
                      {renderInlineNodes(cells[cIdx] || '', `td-${blockKey}-${rIdx}-${cIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 3. Headings (#, ##, ###)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const headingClass =
        level === 1
          ? 'text-[14px] font-bold text-purple-300 mt-1.5 mb-1'
          : level === 2
          ? 'text-[13px] font-bold text-purple-300 mt-1.5 mb-1'
          : 'text-[12px] font-semibold text-purple-200 mt-1 mb-0.5';

      blocks.push(
        <div key={`blk-${blockKey++}`} className={headingClass}>
          {renderInlineNodes(content, `h-${blockKey}`)}
        </div>
      );
      i++;
      continue;
    }

    // 4. Horizontal Rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={`blk-${blockKey++}`} className="my-2 border-white/10" />);
      i++;
      continue;
    }

    // 5. Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote
          key={`blk-${blockKey++}`}
          className="my-1.5 pl-3 border-l-2 border-purple-400/70 text-slate-300 italic space-y-1"
        >
          {quoteLines.map((ql, idx) => (
            <p key={idx}>{renderInlineNodes(ql, `q-${blockKey}-${idx}`)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // 6. Bullet List (- , * , + , • )
    if (/^[-*+•]\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*[-*+•]\s+/.test(lines[i])) {
        listItems.push(lines[i].trim().replace(/^[-*+•]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`blk-${blockKey++}`} className="my-1.5 space-y-1 pl-1">
          {listItems.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-slate-200">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
              <span className="flex-1 min-w-0">
                {renderInlineNodes(item, `ul-${blockKey}-${idx}`)}
              </span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 7. Numbered List (1. , 2. )
    if (/^\d+\.\s+/.test(trimmed)) {
      const stepItems: Array<{ num: string; text: string }> = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const m = lines[i].trim().match(/^(\d+)\.\s+(.+)$/);
        if (m) {
          stepItems.push({ num: m[1], text: m[2] });
        }
        i++;
      }
      blocks.push(
        <ol key={`blk-${blockKey++}`} className="my-1.5 space-y-1.5 pl-0.5">
          {stepItems.map((step, idx) => (
            <li key={idx} className="flex items-start gap-2 text-slate-200">
              <span className="min-w-[18px] font-mono text-[11px] font-bold text-purple-300 flex-shrink-0">
                {step.num}.
              </span>
              <span className="flex-1 min-w-0">
                {renderInlineNodes(step.text, `ol-${blockKey}-${idx}`)}
              </span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 8. Standard Paragraph
    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i];
      const curTrim = cur.trim();
      if (
        !curTrim ||
        curTrim.startsWith('```') ||
        /^#{1,4}\s+/.test(curTrim) ||
        /^[-*+•]\s+/.test(curTrim) ||
        /^\d+\.\s+/.test(curTrim) ||
        curTrim.startsWith('>') ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(curTrim) ||
        (cur.includes('|') && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(cur);
      i++;
    }

    if (paraLines.length > 0) {
      blocks.push(
        <p key={`blk-${blockKey++}`} className="my-1 leading-relaxed text-slate-200 break-words">
          {paraLines.map((pl, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <br />}
              {renderInlineNodes(pl, `p-${blockKey}-${idx}`)}
            </React.Fragment>
          ))}
        </p>
      );
    } else {
      i++;
    }
  }

  return (
    <div className="space-y-1 text-xs leading-relaxed break-words">
      {blocks}
      {isStreaming && (
        <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-purple-400 animate-pulse rounded-xs" />
      )}
    </div>
  );
};
