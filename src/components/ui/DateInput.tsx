import { createUniqueId } from 'solid-js';

interface DateInputProps {
  label: string;
  value: string;
  onInput: (value: string) => void;
  min?: string;
  required?: boolean;
}

export function DateInput(props: DateInputProps) {
  const id = createUniqueId();
  return (
    <div>
      <label for={id} class="mb-1 block text-sm font-medium text-gray-700">
        {props.label}
        {props.required && ' *'}
      </label>
      <input
        id={id}
        type="date"
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        {...(props.min ? { min: props.min } : {})}
        class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        required={props.required}
      />
    </div>
  );
}
