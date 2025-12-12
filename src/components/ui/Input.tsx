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
        <label class="block text-sm font-medium text-gray-700 mb-1">{local.label}</label>
      )}
      <input
        class={cn(
          'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          local.error && 'border-red-500 focus:ring-red-500',
          local.class
        )}
        {...others}
      />
      {local.error && <p class="mt-1 text-sm text-red-600">{local.error}</p>}
    </div>
  );
}
