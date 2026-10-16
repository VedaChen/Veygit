import { useStore } from '../store';

export function SectionHeader({
  id,
  title,
  count,
  actions,
}: {
  id: string;
  title: string;
  count?: number;
  actions?: React.ReactNode;
}) {
  const collapsed = useStore((s) => !!s.collapsed[id]);
  const toggleGroup = useStore((s) => s.toggleGroup);

  return (
    <div className="section-header">
      <button className="section-toggle" onClick={() => toggleGroup(id)}>
        <i className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'}`} />
        <span className="section-title">{title}</span>
        {count !== undefined && count > 0 && <span className="section-count">{count}</span>}
      </button>
      {actions && <div className="section-actions">{actions}</div>}
    </div>
  );
}
