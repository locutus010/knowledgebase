import { useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { FilePlus2, Hash, Settings2, X } from 'lucide-react'
import { get } from '@/lib/api'
import { canEdit, useSpace, useTree } from '@/lib/queries'
import { spaceVars } from '@/lib/colors'
import { buildTree } from '@/lib/tree'
import { cn } from '@/lib/utils'
import { TopBar } from '@/components/TopBar'
import { EmptyState } from '@/components/EmptyState'
import { PageRow } from '@/components/PageListItem'
import { Button } from '@/components/ui/button'
import { Skeleton, SpaceTile } from '@/components/ui/misc'
import { NotFound } from './NotFound'

export default function SpacePage() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const tag = params.get('tag')
  const space = useSpace(slug)
  const tree = useTree(slug)
  const tags = useQuery({ queryKey: ['tags', slug], queryFn: () => get<{ name: string; count: number }[]>(`/spaces/${slug}/tags`), enabled: !!slug })
  const tagged = useQuery({
    queryKey: ['tagged', slug, tag],
    queryFn: () => get<{ id: string; title: string; icon: string; updated_at: string }[]>(`/spaces/${slug}/pages?tag=${encodeURIComponent(tag!)}`),
    enabled: !!slug && !!tag,
  })
  const roots = useMemo(() => buildTree(tree.data ?? []), [tree.data])

  useEffect(() => {
    if (space.data) document.title = `${space.data.name} · Wissensdatenbank`
  }, [space.data])

  if (space.isLoading) return <div><TopBar /><div className="mx-auto max-w-[880px] px-10 pt-14"><Skeleton className="h-24" /></div></div>
  if (!space.data) return <NotFound what="Diesen Bereich" />
  const s = space.data
  const editable = canEdit(s.my_level)

  return (
    <div style={spaceVars(s.color)}>
      <TopBar
        space={s}
        actions={
          <>
            {s.my_level === 'manage' ? (
              <Button asChild variant="ghost" size="sm"><Link to={`/s/${s.slug}/settings`}><Settings2 />Einstellungen</Link></Button>
            ) : null}
            {editable ? (
              <Button asChild variant="primary" size="sm"><Link to={`/s/${s.slug}/new`}><FilePlus2 />Neue Seite</Link></Button>
            ) : null}
          </>
        }
      />
      <div className="mx-auto max-w-[880px] px-5 pt-12 pb-24 sm:px-10">
        <header className="flex items-start gap-5">
          <SpaceTile icon={s.icon} color={s.color} size={64} />
          <div className="min-w-0 pt-1">
            <h1 className="text-[32px] leading-tight font-semibold tracking-[-0.028em]">{s.name}</h1>
            {s.description ? <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-muted">{s.description}</p> : null}
            {s.archived ? <p className="mt-2 text-sm text-warn">Dieser Bereich ist archiviert.</p> : null}
          </div>
        </header>
        <div className="mt-8 h-px bg-gradient-to-r from-[var(--sc)] via-line to-transparent" aria-hidden />

        {tags.data?.length ? (
          <div className="mt-6 flex flex-wrap items-center gap-1.5" role="group" aria-label="Nach Tag filtern">
            {tags.data.map((t) => (
              <button key={t.name} type="button" aria-pressed={tag === t.name}
                onClick={() => setParams(tag === t.name ? {} : { tag: t.name })}
                className={cn('inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12.5px] font-medium transition-colors',
                  tag === t.name ? 'border-transparent bg-[var(--sc)] text-white' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink')}>
                <Hash className="size-3 opacity-70" />{t.name}<span className="opacity-60">{t.count}</span>
              </button>
            ))}
            {tag ? (
              <button type="button" onClick={() => setParams({})} className="ml-1 inline-flex items-center gap-1 text-[12.5px] text-ink-subtle hover:text-ink">
                <X className="size-3.5" />Filter aufheben
              </button>
            ) : null}
          </div>
        ) : null}

        <section className="mt-8">
          {tag ? (
            <>
              <h2 className="mb-3 text-[15px] font-semibold">Seiten mit #{tag}</h2>
              <ul className="-mx-2.5">{tagged.data?.map((p) => <li key={p.id}><PageRow id={p.id} title={p.title} icon={p.icon} at={p.updated_at} /></li>)}</ul>
            </>
          ) : tree.isLoading ? (
            <Skeleton className="h-40" />
          ) : roots.length ? (
            <ul className="-mx-2.5 space-y-0.5">
              {roots.map((n) => (
                <li key={n.id}>
                  <PageRow id={n.id} title={n.title} icon={n.icon}
                    meta={n.children.length ? (n.children.length === 1 ? '1 Unterseite' : `${n.children.length} Unterseiten`) : undefined} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<FilePlus2 />} title={`Lege die erste Seite in ${s.name} an`}
              action={editable ? <Button asChild variant="primary"><Link to={`/s/${s.slug}/new`}><FilePlus2 />Neue Seite</Link></Button> : undefined}>
              {editable ? 'Starte leer oder mit einer Vorlage wie Anleitung oder Runbook.' : 'Hier hat noch niemand geschrieben.'}
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  )
}
