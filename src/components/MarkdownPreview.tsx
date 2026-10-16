import { useMemo } from 'react';
import { marked } from 'marked';

/**
 * Markdown 渲染预览（对照 VS Code 的 markdown 预览；内容来自本地仓库文件）
 *
 * 信任边界说明：这里不做 sanitize，与 VS Code 本地 markdown 预览一致
 * ——内容来自用户自己的本地仓库（diff.modified），渲染的是用户自己写的内容，
 * 不属于不可信输入，因此直接交给 marked 解析。
 */
export function MarkdownPreview({ content }: { content: string }) {
  const html = useMemo(() => marked.parse(content, { async: false }) as string, [content]);
  return <div className="md-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}
