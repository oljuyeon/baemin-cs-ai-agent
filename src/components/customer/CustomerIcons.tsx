import type { SVGProps } from 'react'

type Props = SVGProps<SVGSVGElement>

export function BackIcon(props: Props) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="m14.5 5-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

export function ChevronIcon(props: Props) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

export function CameraIcon(props: Props) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="M4 8.5h3l1.5-2h7l1.5 2h3v10H4v-10Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><circle cx="12" cy="13.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>
}

export function SendIcon(props: Props) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="m4 5 17 7-17 7 3-7-3-7Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M7 12h14" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>
}

export function IssueMiniIcon({ type, ...props }: Props & { type: 'delay' | 'missing' | 'wrong' }) {
  if (type === 'delay') return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M12 7.5V12l3.2 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
  if (type === 'missing') return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="M5 8h14l-1.5 11h-11L5 8Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M9 8a3 3 0 0 1 6 0M9 13h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="m4 8 8-4 8 4-8 4-8-4Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="m4 8 8 4 8-4v8l-8 4-8-4V8Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>
}

export function NavIcon({ type, ...props }: Props & { type: 'home' | 'orders' | 'cases' | 'profile' }) {
  if (type === 'home') return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="m4 11 8-7 8 7v9h-6v-6h-4v6H4v-9Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>
  if (type === 'orders') return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="M5 4h14v16H5V4Z" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
  if (type === 'cases') return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="M5 5h14v11H9l-4 4V5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M5.5 20c.5-4.5 2.7-6.8 6.5-6.8s6 2.3 6.5 6.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
}
