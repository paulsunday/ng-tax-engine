import { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const FIELD_CLASSES =
  "border border-border rounded-lg px-3 py-2 text-sm bg-surface text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent transition-shadow";

export function Label({ children }: { children: ReactNode }) {
  return <label className="text-xs font-medium text-muted mb-1 block">{children}</label>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`${FIELD_CLASSES} ${className}`} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return <select className={`${FIELD_CLASSES} ${className}`} {...rest} />;
}

export function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
