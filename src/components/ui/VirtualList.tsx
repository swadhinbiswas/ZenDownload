import { useState, useRef, useEffect, useCallback, useMemo, ReactNode } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  className?: string;
  emptyState?: ReactNode;
  keyExtractor: (item: T) => string;
}

export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  overscan = 8,
  className = '',
  emptyState,
  keyExtractor,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);

  // Update viewport height on resize
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    setViewportHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  // Reset scroll when items list changes significantly
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [items.length === 0]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollTop(scrollRef.current.scrollTop);
    }
  }, []);

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan
  );

  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className={`relative overflow-y-auto ${className}`}
    >
      {items.length === 0 && emptyState ? (
        emptyState
      ) : (
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              top: startIndex * itemHeight,
              left: 0,
              right: 0,
            }}
          >
            {visibleItems.map((item, i) => (
              <div key={keyExtractor(item)} style={{ height: itemHeight }}>
                {renderItem(item, startIndex + i)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
