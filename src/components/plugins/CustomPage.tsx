import { useState, useEffect } from 'react';
import { Code, ExternalLink } from 'lucide-react';

export function CustomPage({ pageConfig }: { pageConfig?: any }) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (pageConfig?.html_url) {
      fetch(pageConfig.html_url)
        .then(r => r.text())
        .then(setHtml)
        .catch(() => setError('Failed to load plugin page'));
    } else if (pageConfig?.html) {
      setHtml(pageConfig.html);
    }
  }, [pageConfig]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Code className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-zinc-500 text-[13px]">{error}</p>
        </div>
      </div>
    );
  }

  if (!html && !pageConfig?.html_url && !pageConfig?.iframe_url) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Code className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-zinc-500 text-[13px]">Plugin has no content defined</p>
        </div>
      </div>
    );
  }

  if (pageConfig?.iframe_url) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-6 py-2 border-b border-white/[0.04] shrink-0">
          <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-[11px] text-zinc-600 truncate">{pageConfig.iframe_url}</span>
        </div>
        <iframe
          src={pageConfig.iframe_url}
          className="flex-1 w-full border-none bg-white"
          sandbox="allow-scripts allow-same-origin"
          title="Plugin Content"
        />
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
