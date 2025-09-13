import * as React from "react";

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }
) {
  const { className = "", variant = "primary", ...rest } = props;
  const base = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none h-9 px-4 py-2";
  const variants: Record<string, string> = {
    primary: "bg-black text-white hover:bg-zinc-800",
    ghost: "bg-transparent hover:bg-zinc-100 text-black",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...rest} />;
}

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-lg border border-zinc-200 bg-white shadow-sm ${className}`} {...props} />
  );
}

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; helperText?: string }
) {
  const { label, helperText, className = "", id, ...rest } = props;
  const input = (
    <input
      id={id}
      className={`flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${className}`}
      {...rest}
    />
  );
  if (!label) return input;
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-zinc-700">{label}</span>
      {input}
      {helperText ? <span className="text-xs text-zinc-500">{helperText}</span> : null}
    </label>
  );
}

