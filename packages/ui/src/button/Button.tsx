import React, { useState } from 'react';
import { Dialog } from '../dialog/Dialog.js';
import { Textarea } from '../textarea/Textarea.js';
export type ButtonVariant =
  'primary' | 'primary-dark' | 'secondary' | 'text' | 'danger';
export type ButtonSize = 56 | 48 | 40 | 32;
export type ButtonConfirmationCopy = {
  title: string;
  message: string;
  reasonLabel: string;
  cancelLabel: string;
  confirmLabel: string;
  closeLabel: string;
};
type NativeButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'variant'
>;
type ButtonProps = NativeButtonProps & { size?: ButtonSize } & (
    | {
        variant: 'danger';
        confirmation: ButtonConfirmationCopy;
        onDangerConfirm: (reason: string) => void;
      }
    | {
        variant?: Exclude<ButtonVariant, 'danger'>;
        confirmation?: never;
        onDangerConfirm?: never;
      }
  );
export function Button({
  variant = 'primary',
  size = 40,
  confirmation,
  children,
  className = '',
  onClick,
  onDangerConfirm,
  ...props
}: ButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const isDanger = variant === 'danger';
  const finish = () => {
    setConfirming(false);
    setReason('');
  };
  return (
    <>
      <button
        {...props}
        type={props.type ?? 'button'}
        className={`nb-button nb-${variant} nb-size-${size} ${className}`}
        onClick={(event) => {
          if (isDanger) {
            event.preventDefault();
            if (!props.disabled && confirmation) setConfirming(true);
            return;
          }
          onClick?.(event);
        }}
      >
        {children}
        {variant.startsWith('primary') && (
          <i aria-hidden="true" className="nb-button-signal" />
        )}
      </button>
      {confirmation && (
        <Dialog
          open={confirming}
          title={confirmation.title}
          closeLabel={confirmation.closeLabel}
          onClose={finish}
          actions={
            <>
              <button type="button" onClick={finish}>
                {confirmation.cancelLabel}
              </button>
              <button
                type="button"
                className="nb-confirm-danger"
                disabled={!reason.trim()}
                onClick={() => {
                  const value = reason.trim();
                  finish();
                  onDangerConfirm?.(value);
                }}
              >
                {confirmation.confirmLabel}
              </button>
            </>
          }
        >
          <p>{confirmation.message}</p>
          <Textarea
            label={confirmation.reasonLabel}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
          />
        </Dialog>
      )}
    </>
  );
}
