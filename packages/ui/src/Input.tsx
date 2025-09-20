import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className = '', ...props }: InputProps,
    ref: React.ForwardedRef<HTMLInputElement>
  ) => {
    const classes = `w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 ${className}`.trim();

    return (
      <input
        ref={ref}
        className={classes}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
