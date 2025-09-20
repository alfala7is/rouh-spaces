import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ children, className = '', ...props }: CardProps) {
  const classes = `bg-white rounded-lg border border-gray-200 shadow-sm ${className}`.trim();

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
