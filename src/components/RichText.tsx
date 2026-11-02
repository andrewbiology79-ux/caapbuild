import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export interface RichTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

interface Segment {
  type: 'text' | 'inline-math' | 'block-math';
  content: string;
}

/**
 * Tokenize string into regular text, inline math ($...$), and block math ($$...$$)
 */
function parseSegments(rawText: string): Segment[] {
  if (!rawText) return [];

  const segments: Segment[] = [];
  // Matches $$...$$ or $...$
  const regex = /(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawText)) !== null) {
    const matchIndex = match.index;

    // Normal text preceding the math
    if (matchIndex > lastIndex) {
      segments.push({
        type: 'text',
        content: rawText.substring(lastIndex, matchIndex),
      });
    }

    const token = match[0];
    if (token.startsWith('$$') && token.endsWith('$$')) {
      segments.push({
        type: 'block-math',
        content: token.slice(2, -2).trim(),
      });
    } else if (token.startsWith('$') && token.endsWith('$')) {
      segments.push({
        type: 'inline-math',
        content: token.slice(1, -1).trim(),
      });
    } else {
      segments.push({
        type: 'text',
        content: token,
      });
    }

    lastIndex = regex.lastIndex;
  }

  // Trailing normal text
  if (lastIndex < rawText.length) {
    segments.push({
      type: 'text',
      content: rawText.substring(lastIndex),
    });
  }

  return segments;
}

export const RichText: React.FC<RichTextProps> = ({ text, className = '', style = {} }) => {
  const segments = useMemo(() => parseSegments(text), [text]);

  if (!text) {
    return null;
  }

  return (
    <div
      className={`leading-relaxed text-[#1B1F2A] ${className}`}
      style={{
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        maxWidth: '100%',
        ...style,
      }}
    >
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={index}>{segment.content}</span>;
        }

        const isBlock = segment.type === 'block-math';

        try {
          const renderedHtml = katex.renderToString(segment.content, {
            displayMode: isBlock,
            throwOnError: true,
          });

          if (isBlock) {
            return (
              <span
                key={index}
                className="block my-2 text-center overflow-x-auto py-1 max-w-full select-text"
                style={{
                  maxWidth: '100%',
                  overflowX: 'auto',
                }}
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            );
          }

          return (
            <span
              key={index}
              className="inline-block mx-0.5 align-middle select-text max-w-full overflow-x-auto"
              style={{
                maxWidth: '100%',
                overflowX: 'auto',
                verticalAlign: 'middle',
              }}
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          );
        } catch (error: any) {
          // If error occurs, do not crash! Display faulty code in red.
          return (
            <span
              key={index}
              title={`LaTeX Error: ${error?.message || 'Syntax error'}`}
              className="inline-block text-red-600 bg-red-50 border border-red-200 px-1 py-0.5 mx-0.5 rounded text-xs font-mono break-all align-middle"
              style={{ overflowWrap: 'anywhere', wordBreak: 'break-all' }}
            >
              {isBlock ? `$$${segment.content}$$` : `$${segment.content}$`}
            </span>
          );
        }
      })}
    </div>
  );
};

export default RichText;
