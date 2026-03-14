import React from 'react';
import { Platform } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

const markdownStyles = {
  body: {
    fontSize: typography.fontSize.base,
    color: colors.slate[800],
    lineHeight: 22,
  },
  strong: {
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  em: {
    fontStyle: 'italic' as const,
  },
  heading1: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    marginTop: 8,
    marginBottom: 4,
  },
  heading2: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    marginTop: 6,
    marginBottom: 2,
  },
  heading3: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    marginTop: 4,
    marginBottom: 2,
  },
  bullet_list: {
    marginTop: 2,
    marginBottom: 2,
  },
  ordered_list: {
    marginTop: 2,
    marginBottom: 2,
  },
  list_item: {
    marginBottom: 2,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 6,
  },
  code_inline: {
    backgroundColor: colors.slate[100],
    color: colors.slate[700],
    fontSize: typography.fontSize.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'monospace',
  },
  fence: {
    backgroundColor: colors.slate[100],
    borderColor: colors.slate[200],
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginVertical: 4,
  },
  code_block: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[700],
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'monospace',
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary[300],
    paddingLeft: 10,
    marginLeft: 0,
    marginVertical: 4,
  },
  hr: {
    backgroundColor: colors.slate[200],
    height: 1,
    marginVertical: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: 4,
    marginVertical: 4,
  },
  th: {
    backgroundColor: colors.slate[50],
    padding: 6,
    fontWeight: typography.fontWeight.semibold,
  },
  td: {
    padding: 6,
    borderTopWidth: 1,
    borderColor: colors.slate[200],
  },
};

interface ChatMarkdownProps {
  content: string;
}

export default function ChatMarkdown({ content }: ChatMarkdownProps) {
  return (
    <Markdown style={markdownStyles}>
      {content}
    </Markdown>
  );
}
