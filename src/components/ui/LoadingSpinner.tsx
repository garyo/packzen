export function LoadingSpinner(props: { text?: string }) {
  return (
    <div role="status" class="flex flex-col items-center justify-center py-12">
      <div class="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
      {props.text ? (
        <p class="mt-4 text-gray-600">{props.text}</p>
      ) : (
        <span class="sr-only">Loading…</span>
      )}
    </div>
  );
}
