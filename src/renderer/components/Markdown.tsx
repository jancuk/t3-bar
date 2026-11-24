import { Fragment, useMemo } from 'react';
import { parseMarkdown, type MdBlock, type MdInline } from '../../shared/markdown';

function renderInlines(nodes: MdInline[], keyPrefix: string) {
  return nodes.map((node, idx) => {
    const key = `${keyPrefix}-${idx}`;
    switch (node.type) {
      case 'text':
        return <Fragment key={key}>{node.text}</Fragment>;
      case 'bold':
        return <strong key={key} className="font-semibold text-neutral-100">{renderInlines(node.children, key)}</strong>;
      case 'italic':
        return <em key={key} className="italic">{renderInlines(node.children, key)}</em>;
      case 'strike':
        return <del key={key} className="text-neutral-500 line-through">{renderInlines(node.children, key)}</del>;
      case 'code':
        return (
          <code key={key} className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[11.5px] text-neutral-100">
            {node.text}
          </code>
        );
      case 'link':
        return (
          <span key={key} title={node.href} className="text-accent underline decoration-accent/50 underline-offset-2">
            {node.label}
          </span>
        );
    }
  });
}

function renderBlock(block: MdBlock, idx: number) {
  const key = `b-${idx}`;
  switch (block.type) {
    case 'heading': {
      const size = block.level <= 2 ? 'text-[13px]' : 'text-[12.5px]';
      return (
        <div key={key} className={`${size} font-semibold text-neutral-100`}>
          {renderInlines(block.children, key)}
        </div>
      );
    }
    case 'paragraph':
      return (
        <p key={key} className="whitespace-pre-wrap break-words">
          {renderInlines(block.children, key)}
        </p>
      );
    case 'code':
      return (
        <pre key={key} className="overflow-x-auto rounded-md border border-white/[0.08] bg-black/35 px-2.5 py-2 font-mono text-[11px] leading-snug text-neutral-200">
          <code>{block.text}</code>
        </pre>
      );
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      const listCls = block.ordered ? 'list-decimal' : 'list-disc';
      return (
        <Tag key={key} className={`${listCls} space-y-1 pl-4 marker:text-neutral-500`}>
          {block.items.map((item, j) => (
            <li key={`${key}-i-${j}`} className="break-words pl-0.5">
              {renderInlines(item, `${key}-i-${j}`)}
            </li>
          ))}
        </Tag>
      );
    }
    case 'quote':
      return (
        <blockquote key={key} className="border-l-2 border-white/20 pl-2.5 text-neutral-400">
          {renderInlines(block.children, key)}
        </blockquote>
      );
    case 'hr':
      return <hr key={key} className="border-white/10" />;
  }
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className={`selectable space-y-1.5 text-[12.5px] leading-relaxed ${className}`}>
      {blocks.map(renderBlock)}
    </div>
  );
}
