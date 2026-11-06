import type { ReactNode } from 'react';
import { Checkbox } from '../choice/Choice.js';
export function EntryListRow({
  name,
  vehicle,
  hints,
  imageUrl,
  imageAlt = '',
  className,
  number,
  selected = false,
  checked = false,
  onSelect,
  onOpen,
  openActionId,
  status,
  payment,
  inspection,
  waiver,
  nextAction,
  menu,
  selectLabel,
}: {
  name: string;
  vehicle: string;
  hints?: ReactNode;
  imageUrl?: string | null;
  imageAlt?: string;
  className: string;
  number?: string | null;
  selected?: boolean;
  checked?: boolean;
  onSelect?: (selected: boolean) => void;
  onOpen?: () => void;
  openActionId?: string;
  status: ReactNode;
  payment?: ReactNode;
  inspection?: ReactNode;
  waiver?: ReactNode;
  nextAction?: ReactNode;
  menu?: ReactNode;
  selectLabel: string;
}) {
  return (
    <tr
      className={`nb-entry-list-row${selected ? ' is-selected' : ''}`}
      onClick={onOpen}
    >
      <td onClick={(event) => event.stopPropagation()}>
        <Checkbox
          visuallyHiddenLabel
          label={selectLabel}
          checked={checked}
          onChange={(event) => onSelect?.(event.target.checked)}
        />
      </td>
      <td>
        <div className="nb-entry-list-person">
          {imageUrl ? (
            <img src={imageUrl} alt={imageAlt} />
          ) : (
            <span className="nb-entry-list-image-empty" aria-label={imageAlt}>
              —
            </span>
          )}
          {onOpen ? (
            <button
              className="nb-entry-list-open"
              data-entry-action={openActionId}
              data-selected-entry={selected ? true : undefined}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
            >
              <strong>{name}</strong>
              <small>{vehicle}</small>
              {hints}
            </button>
          ) : (
            <span>
              <strong>{name}</strong>
              <small>{vehicle}</small>
              {hints}
            </span>
          )}
        </div>
      </td>
      <td>{className}</td>
      <td>
        <strong className="nb-entry-list-number">{number || '—'}</strong>
      </td>
      <td>{status}</td>
      <td>{payment}</td>
      <td>{inspection}</td>
      <td>{waiver}</td>
      <td onClick={(event) => event.stopPropagation()}>
        {nextAction}
        {menu}
      </td>
    </tr>
  );
}
