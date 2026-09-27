import { splitProps, type JSX } from 'solid-js';
import { cn } from '../../lib/utils';

// Matches the API's quantity bounds (lib/validation.ts).
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 9999;

interface QuantityInputProps extends Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onInput' | 'onChange' | 'type'
> {
  value: number;
  onChange: (value: number) => void;
}

/**
 * A whole-number field that doesn't fight the user mid-typing: while the text
 * isn't a valid quantity (e.g. just cleared), `value` keeps its last valid
 * number, and blur puts that number back in the field.
 */
export function QuantityInput(props: QuantityInputProps) {
  const [local, others] = splitProps(props, ['value', 'onChange', 'class']);

  return (
    <input
      type="number"
      inputmode="numeric"
      min={MIN_QUANTITY}
      max={MAX_QUANTITY}
      value={local.value}
      onInput={(e) => {
        const n = parseInt(e.currentTarget.value, 10);
        if (n >= MIN_QUANTITY && n <= MAX_QUANTITY) local.onChange(n);
      }}
      onBlur={(e) => {
        e.currentTarget.value = String(local.value);
      }}
      class={cn(
        // Size and padding come from the caller.
        'rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:outline-none',
        local.class
      )}
      {...others}
    />
  );
}
