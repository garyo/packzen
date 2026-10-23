import {
  createEffect,
  createSignal,
  createUniqueId,
  on,
  splitProps,
  type Accessor,
  type JSX,
} from 'solid-js';
import { cn } from '../../lib/utils';
import { shake } from '../../lib/motion';

/** A field's validation message, shown under the field (see `createFieldError`). */
export interface FieldError {
  message: Accessor<string | undefined>;
  /** Attach to the field, so `fail` can shake and focus it. */
  ref: (el: HTMLElement) => void;
  /** Shows `message`, shakes the field and focuses it. */
  fail: (message: string) => void;
}

/** Validation for one field; the message clears as soon as `value` changes. */
export function createFieldError(value: Accessor<unknown>): FieldError {
  const [message, setMessage] = createSignal<string>();
  let field: HTMLElement | undefined;
  createEffect(on(value, () => setMessage(undefined), { defer: true }));
  return {
    message,
    ref: (el) => (field = el),
    fail: (text) => {
      setMessage(text);
      shake(field);
      field?.focus();
    },
  };
}

/** Wires a raw <input> to a FieldError; spread it onto the element. */
export const fieldErrorAttrs = (field: FieldError | undefined, errorId: string) => ({
  ref: field?.ref,
  'aria-invalid': field?.message() ? true : undefined,
  'aria-describedby': field?.message() ? errorId : undefined,
});

/** The message under a field; renders nothing without one. */
export function FieldErrorMessage(props: { id: string; message: string | undefined }) {
  return (
    <>
      {props.message && (
        <p id={props.id} class="mt-1 text-sm text-red-600">
          {props.message}
        </p>
      )}
    </>
  );
}

interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Validation from `createFieldError`; takes the place of `error`. */
  field?: FieldError;
}

export function Input(props: InputProps) {
  const [local, others] = splitProps(props, ['label', 'error', 'field', 'class', 'id']);
  const fallbackId = createUniqueId();
  const id = () => local.id ?? fallbackId;
  const errorId = `${fallbackId}-error`;
  const error = () => local.error ?? local.field?.message();

  return (
    <div class="w-full">
      {local.label && (
        <label for={id()} class="mb-1 block text-sm font-medium text-gray-700">
          {local.label}
        </label>
      )}
      <input
        id={id()}
        ref={local.field?.ref}
        class={cn(
          'w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none',
          error() && 'border-red-500 focus:ring-red-500',
          local.class
        )}
        aria-invalid={error() ? true : undefined}
        aria-describedby={error() ? errorId : undefined}
        {...others}
      />
      <FieldErrorMessage id={errorId} message={error()} />
    </div>
  );
}
