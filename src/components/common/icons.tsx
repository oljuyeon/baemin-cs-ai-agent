import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

export function ArrowIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function SparkIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="M12 2.8c.7 4.5 2.8 6.6 7.2 7.2-4.4.7-6.5 2.8-7.2 7.2-.7-4.4-2.8-6.5-7.2-7.2 4.4-.6 6.5-2.7 7.2-7.2Z" fill="currentColor"/><path d="M19 15.3c.25 1.7 1.05 2.5 2.7 2.7-1.65.25-2.45 1.05-2.7 2.7-.25-1.65-1.05-2.45-2.7-2.7 1.65-.2 2.45-1 2.7-2.7Z" fill="currentColor" opacity=".65"/></svg>
}

export function CheckIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props}><path d="m5 12.4 4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

export function RoleIcon({ type, ...props }: IconProps & { type: 'customer' | 'merchant' | 'cs' }) {
  if (type === 'customer') return <svg viewBox="0 0 32 32" aria-hidden="true" {...props}><circle cx="16" cy="11" r="5" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M7 27c.7-6 4-9 9-9s8.3 3 9 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  if (type === 'merchant') return <svg viewBox="0 0 32 32" aria-hidden="true" {...props}><path d="M6 13h20l-2.1-7H8.1L6 13Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M8 13v13h16V13M12 26v-7h8v7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M6 13c0 2 1.4 3.3 3.2 3.3s3.1-1.3 3.1-3.3c0 2 1.7 3.3 3.7 3.3s3.7-1.3 3.7-3.3c0 2 1.3 3.3 3.1 3.3S26 15 26 13" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>
  return <svg viewBox="0 0 32 32" aria-hidden="true" {...props}><path d="M6 17a10 10 0 0 1 20 0" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M6 17v6a3 3 0 0 0 3 3h2v-9H6ZM26 17v6a3 3 0 0 1-3 3h-2v-9h5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M21 28h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
}

export function IssueIcon({ type, ...props }: IconProps & { type: 'delay' | 'missing' | 'wrong' }) {
  if (type === 'delay') return <svg viewBox="0 0 32 32" aria-hidden="true" {...props}><circle cx="16" cy="17" r="10" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M16 11v6l4 2M12 4h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  if (type === 'missing') return <svg viewBox="0 0 32 32" aria-hidden="true" {...props}><path d="M7 11h18l-2 16H9L7 11Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M12 11a4 4 0 0 1 8 0M13 18h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  return <svg viewBox="0 0 32 32" aria-hidden="true" {...props}><path d="m6 11 10-6 10 6-10 6-10-6Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="m6 11 10 6 10-6v11l-10 6-10-6V11Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="m12 8 10 6v7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
}
