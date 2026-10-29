import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'

import { api } from '@/lib/api'
import { back, go } from '@/lib/go'
import { queryKeys } from '@/lib/query-keys'
import { useRemote } from '@/lib/use-remote'

import { CatalogueScreen } from '@/components/catalogue-screen'
import { RemoteGate } from '@/components/screen-state'

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first && first.length > 0 ? first : undefined
}

export default function CatalogueRoute() {
  const params = useLocalSearchParams<{
    genre?: string
    platform?: string
    developer?: string
    publisher?: string
    esrb?: string
  }>()
  const genre = one(params.genre)
  const platform = one(params.platform)
  const developer = one(params.developer)
  const publisher = one(params.publisher)
  const esrb = one(params.esrb)
  const filterKey = `${genre ?? ''}|${platform ?? ''}|${developer ?? ''}|${publisher ?? ''}|${esrb ?? ''}`
  const [pageState, setPageState] = useState({ filterKey, page: 1 })
  const page = pageState.filterKey === filterKey ? pageState.page : 1
  function setPage(next: number) {
    setPageState({ filterKey, page: next })
  }
  const remote = useRemote(
    viewer => queryKeys.catalogue({ genre, platform, developer, publisher, esrb }, page, viewer),
    () => api.games.list({
      genre: genre ?? null,
      platform: platform ?? null,
      developer: developer ?? null,
      publisher: publisher ?? null,
      esrb: esrb ?? null,
      page,
      pageSize: 10,
    }),
    true,
  )
  if (remote.gate || !remote.query.data) return <RemoteGate gate={remote.gate} onRetry={() => { void remote.query.refetch() }} />
  const data = remote.query.data
  const genreName = genre ? data.genres.find(item => item.slug === genre)?.name ?? genre : null
  const platformName = platform ? data.platforms.find(item => item.slug === platform)?.name ?? platform : null
  const esrbName = esrb ? data.esrb_ratings.find(item => item === esrb) ?? esrb : null
  const filterLabel = [genreName, platformName, developer, publisher, esrbName].filter((item): item is string => !!item).join(' · ') || null
  return (
    <CatalogueScreen
      filterLabel={filterLabel}
      games={data.games}
      total={data.total}
      page={page}
      totalPages={data.total_pages}
      onOpen={go}
      onPage={setPage}
      onBack={back}
    />
  )
}
