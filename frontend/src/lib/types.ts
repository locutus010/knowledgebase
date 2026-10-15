// Spiegel der Pydantic-Schemas im Backend (kb/api/*.py).

export type Role = 'admin' | 'editor' | 'reader'
export type Level = 'none' | 'read' | 'edit' | 'manage'
export type SpaceColor = 'teal' | 'indigo' | 'violet' | 'rose' | 'orange' | 'amber' | 'green' | 'slate'

export interface Me {
  id: string
  email: string
  name: string
  role: Role
  avatar_color: string
  must_change_password: boolean
  is_local: boolean
}

export interface Space {
  id: string
  slug: string
  name: string
  icon: string
  color: SpaceColor
  description: string
  default_access: 'none' | 'read' | 'edit'
  my_level: Level
  page_count: number
  archived: boolean
}

export interface SpaceRef {
  slug: string
  name: string
  color: SpaceColor
  icon: string
}

export interface PersonRef {
  id: string
  name: string
}

export interface Page {
  id: string
  title: string
  icon: string
  content_md: string
  parent_id: string | null
  position: number
  version: number
  created_at: string
  updated_at: string
  created_by: PersonRef | null
  updated_by: PersonRef | null
  space: SpaceRef
  breadcrumbs: { id: string; title: string; icon: string }[]
  tags: string[]
  is_favorite: boolean
  my_level: Level
}

export interface TreeNode {
  id: string
  parent_id: string | null
  title: string
  icon: string
  position: number
  has_children: boolean
}

export interface PageCard {
  id: string
  title: string
  icon: string
  space: SpaceRef
  at: string
}

export interface Home {
  recent_views: PageCard[]
  recent_changes: PageCard[]
  favorites: PageCard[]
}

export interface SearchHit {
  page_id: string
  title: string
  icon: string
  space: SpaceRef
  snippet_html: string
  updated_at: string
}

export interface Template {
  id: string
  name: string
  description: string
  icon: string
  content_md: string
  space_slug: string | null
  can_edit: boolean
}

export interface RevisionMeta {
  version: number
  /** fortlaufend ab 1 — für Menschen; version ist der interne Zähler */
  number: number
  title: string
  author: PersonRef | null
  created_at: string
}

export interface Attachment {
  id: string
  filename: string
  mime_type: string
  size: number
  url: string
  created_at: string
  listed: boolean
  uploaded_by: PersonRef | null
}

export interface AdminUser {
  id: string
  email: string
  name: string
  role: Role
  active: boolean
  is_local: boolean
  is_sso: boolean
  avatar_color: string
  created_at: string
  last_login_at: string | null
}

export interface Member {
  user_id: string
  name: string
  email: string
  avatar_color: string
  level: 'read' | 'edit' | 'manage'
}

export interface DirectoryUser {
  id: string
  name: string
  email: string
  avatar_color: string
}

export interface TrashItem {
  id: string
  title: string
  icon: string
  deleted_at: string
}

export interface Conflict {
  version: number
  title: string
  content_md: string
  updated_by: string | null
}
