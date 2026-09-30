import type { RoleDefinition } from '../../types/role'

export const roles: RoleDefinition[] = [
  { id: 'customer', path: '/customer', icon: 'customer' },
  { id: 'merchant', path: '/merchant', icon: 'merchant' },
  { id: 'cs', path: '/cs', icon: 'cs' },
]
