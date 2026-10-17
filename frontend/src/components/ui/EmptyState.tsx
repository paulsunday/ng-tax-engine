export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center py-10 px-4 border border-dashed border-border rounded-xl text-sm text-muted">
      {children}
    </div>
  );
}
