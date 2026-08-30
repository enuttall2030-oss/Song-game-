import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  const classes = ['button', variant === 'secondary' ? 'secondary' : '', className].filter(Boolean).join(' ');
  return <button className={classes} {...rest} />;
}
