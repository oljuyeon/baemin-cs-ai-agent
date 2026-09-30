import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface ButtonProps {
  children: ReactNode
  to: string
  variant?: 'primary' | 'secondary' | 'ghost'
  className?: string
}

export function Button({ children, to, variant = 'primary', className = '' }: ButtonProps) {
  return <Link to={to} className={`button button--${variant} ${className}`.trim()}>{children}</Link>
}
