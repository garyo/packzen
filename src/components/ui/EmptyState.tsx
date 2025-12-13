import type { JSX } from 'solid-js';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: JSX.Element;
}

export function EmptyState(props: EmptyStateProps) {
  return (
    <div class="flex flex-col items-center justify-center px-4 py-12">
      <div class="mb-4 text-6xl">{props.icon}</div>
      <h3 class="mb-2 text-xl font-semibold text-gray-900">{props.title}</h3>
      <p class="mb-6 max-w-md text-center text-gray-600">{props.description}</p>
      {props.action}
    </div>
  );
}
