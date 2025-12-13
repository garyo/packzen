import { splitProps, type JSX } from 'solid-js';
import { cn } from '../../lib/utils';

interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input(props: InputProps) {
  const [local, others] = splitProps(props, ['label', 'error', 'class']);

  return (
    <div class="w-full">
      {local.label && (
        <label class="mb-1 block text-sm font-medium text-gray-700">{local.label}</label>
      )}
      <input
        class={cn(
          'w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none',
          local.error && 'border-red-500 focus:ring-red-500',
          local.class
        )}
        {...others}
      />
      {local.error && <p class="mt-1 text-sm text-red-600">{local.error}</p>}
    </div>
  );
}
