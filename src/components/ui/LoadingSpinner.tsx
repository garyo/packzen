export function LoadingSpinner(props: { text?: string }) {
  return (
    <div class="flex flex-col items-center justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      {props.text && <p class="mt-4 text-gray-600">{props.text}</p>}
    </div>
  );
}
