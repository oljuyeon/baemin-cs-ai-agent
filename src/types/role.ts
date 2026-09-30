export type RoleId = 'customer' | 'merchant' | 'cs'

export interface RoleDefinition {
  id: RoleId
  path: `/${RoleId}`
  icon: 'customer' | 'merchant' | 'cs'
}
