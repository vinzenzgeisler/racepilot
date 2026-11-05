import React, { useRef } from 'react';
export type TabItem = { id: string; label: string; content: React.ReactNode };
export function Tabs({
  tabs,
  selected,
  onChange,
  label,
}: {
  tabs: TabItem[];
  selected: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (index: number, key: string) => {
    const delta = key === 'ArrowRight' ? 1 : -1;
    const next = (index + delta + tabs.length) % tabs.length;
    onChange(tabs[next]!.id);
    refs.current[next]?.focus();
  };
  const active = tabs.find((tab) => tab.id === selected) ?? tabs[0];
  return (
    <div className="nb-tabs">
      <div role="tablist" aria-label={label}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            id={`${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={tab.id === active?.id}
            aria-controls={`${tab.id}-panel`}
            tabIndex={tab.id === active?.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                move(index, event.key);
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active && (
        <section
          id={`${active.id}-panel`}
          role="tabpanel"
          aria-labelledby={`${active.id}-tab`}
        >
          {active.content}
        </section>
      )}
    </div>
  );
}
