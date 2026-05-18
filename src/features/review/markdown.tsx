import { Fragment, type ReactNode } from 'react';

const BOLD_REGEX = /\*\*(.+?)\*\*/g;

export function renderBold(text: string): ReactNode[] {
  if (!text) return [];
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  // reset state because the regex has the global flag
  BOLD_REGEX.lastIndex = 0;
  while ((match = BOLD_REGEX.exec(text)) !== null) {
    const [full, inner] = match;
    const start = match.index;
    if (start > lastIndex) {
      nodes.push(<Fragment key={`t-${key++}`}>{text.slice(lastIndex, start)}</Fragment>);
    }
    nodes.push(<strong key={`b-${key++}`}>{inner}</strong>);
    lastIndex = start + full.length;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`t-${key}`}>{text.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}
