export type KeyboardHintItem = { keys: string; label: string };

export function KeyboardHintBar({ items }: { items: KeyboardHintItem[] }) {
  return (
    <p className="nb-keyboard-hint-bar">
      {items.map((item, index) => (
        <span key={`${item.keys}-${item.label}`}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          <kbd>{item.keys}</kbd> {item.label}
        </span>
      ))}
    </p>
  );
}
