import React from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'md' | 'sm';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong active:bg-brand-strong shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-app active:bg-app',
  danger: 'bg-danger-strong text-white hover:bg-danger-strong/90 active:bg-danger-strong/80 shadow-sm',
  ghost: 'bg-transparent text-brand hover:bg-brand-soft active:bg-brand-soft',
};

const SIZES: Record<Size, string> = {
  md: 'min-h-[44px] px-4 text-sm',
  sm: 'min-h-[36px] px-3 text-xs',
};

/** Shared button: one look for every action in the app. */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={`${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} rounded-xl font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${className}`}
    {...rest}
  />
);

export default Button;
