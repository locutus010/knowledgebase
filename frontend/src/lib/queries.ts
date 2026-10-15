import { useQuery } from '@tanstack/react-query'
import { get } from './api'
import type { Home, Page, Space, Template, TreeNode } from './types'

export const qk = {
  spaces: ['spaces'] as const,
  space: (slug: string) => ['space', slug] as const,
  tree: (slug: string) => ['tree', slug] as const,
  page: (id: string) => ['page', id] as const,
  home: ['home'] as const,
  templates: (slug?: string) => ['templates', slug ?? ''] as const,
}

export const useSpaces = (archived = false) =>
  useQuery({ queryKey: [...qk.spaces, archived], queryFn: () => get<Space[]>(`/spaces${archived ? '?archived=true' : ''}`) })

export const useSpace = (slug: string | undefined) =>
  useQuery({ queryKey: qk.space(slug ?? ''), queryFn: () => get<Space>(`/spaces/${slug}`), enabled: !!slug })

export const useTree = (slug: string | undefined) =>
  useQuery({ queryKey: qk.tree(slug ?? ''), queryFn: () => get<TreeNode[]>(`/spaces/${slug}/tree`), enabled: !!slug })

export const usePage = (id: string | undefined) =>
  useQuery({ queryKey: qk.page(id ?? ''), queryFn: () => get<Page>(`/pages/${id}`), enabled: !!id, staleTime: 0 })

export const useHome = () => useQuery({ queryKey: qk.home, queryFn: () => get<Home>('/me/home') })

export const useTemplates = (slug?: string) =>
  useQuery({ queryKey: qk.templates(slug), queryFn: () => get<Template[]>(`/templates${slug ? `?space=${slug}` : ''}`) })

export const canEdit = (level: string | undefined) => level === 'edit' || level === 'manage'
