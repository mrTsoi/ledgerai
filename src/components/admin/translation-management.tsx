'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Plus, Save, Trash2, Search, X, Wand2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useLiterals } from '@/hooks/use-literals'
import { toast } from "sonner"

interface Translation {
  id: string
  locale: string
  namespace: string
  key: string
  value: string
}

interface Language {
  code: string
  name: string
  flag_emoji: string
}

const NAMESPACES = [
  'all',
  'common',
  'navigation',
  'auth',
  'accounts',
  'transactions',
  'documents',
  'reports',
  'admin',
  'errors',
  'banking',
  'literals',
]

export function TranslationManagement() {
  const t = useTranslations('common') // Use common for UI labels
  const lt = useLiterals()
  const currentLocale = useLocale()
  const sourceLocale = 'en'
  const [languages, setLanguages] = useState<Language[]>([])
  const [translations, setTranslations] = useState<Translation[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLocale, setSelectedLocale] = useState<string>(currentLocale || 'en')
  const [selectedNamespace, setSelectedNamespace] = useState<string>('literals')
  const [searchQuery, setSearchQuery] = useState('')

  // Literals review (en + zh-CN + zh-HK)
  const LITERALS_REVIEW_PAGE_SIZE = 100
  const [literalsReviewLoading, setLiteralsReviewLoading] = useState(false)
  const [literalsReviewLoadingMore, setLiteralsReviewLoadingMore] = useState(false)
  const [literalsReviewOffset, setLiteralsReviewOffset] = useState(0)
  const [literalsReviewHasMore, setLiteralsReviewHasMore] = useState(false)
  const [literalsReviewQuery, setLiteralsReviewQuery] = useState('')
  const [literalsReviewItems, setLiteralsReviewItems] = useState<
    Array<{ key: string; en: string; zhCN: string; zhHK: string }>
  >([])
  const [literalsReviewDrafts, setLiteralsReviewDrafts] = useState<Record<string, string>>({})
  const [literalsReviewOnlyMissing, setLiteralsReviewOnlyMissing] = useState(true)
  const [literalsReviewAiBusy, setLiteralsReviewAiBusy] = useState<Record<string, boolean>>({})

  const literalsReviewSentinelRef = useRef<HTMLDivElement | null>(null)

  const LITERALS_REVIEW_SEARCH_DEBOUNCE_MS = 350

  const LITERALS_AUTOSAVE_DEBOUNCE_MS = 800
  const literalsAutosaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({})

  const [literalsBulkRunning, setLiteralsBulkRunning] = useState(false)
  const [literalsBulkDone, setLiteralsBulkDone] = useState(0)
  const [literalsBulkTotal, setLiteralsBulkTotal] = useState(0)
  const [literalsBulkCurrent, setLiteralsBulkCurrent] = useState<string | null>(null)

  const literalsReviewDisplayed = useMemo(() => {
    const rows = literalsReviewItems
    // If the user is searching, show matches even if they are already translated.
    // Otherwise search becomes confusing because "Only missing" hides the row.
    if (literalsReviewQuery.trim() !== '') return rows
    if (!literalsReviewOnlyMissing) return rows

    return rows.filter((it) => {
      const zhCNKey = `${it.key}::zh-CN`
      const zhHKKey = `${it.key}::zh-HK`
      const zhCN = (literalsReviewDrafts[zhCNKey] ?? it.zhCN).trim()
      const zhHK = (literalsReviewDrafts[zhHKKey] ?? it.zhHK).trim()
      return !zhCN || !zhHK
    })
  }, [literalsReviewItems, literalsReviewOnlyMissing, literalsReviewDrafts, literalsReviewQuery])

  const literalsReviewStats = useMemo(() => {
    const rows = literalsReviewDisplayed
    let missingZhCN = 0
    let missingZhHK = 0
    for (const it of rows) {
      const zhCNKey = `${it.key}::zh-CN`
      const zhHKKey = `${it.key}::zh-HK`
      const zhCN = (literalsReviewDrafts[zhCNKey] ?? it.zhCN).trim()
      const zhHK = (literalsReviewDrafts[zhHKKey] ?? it.zhHK).trim()
      if (!zhCN) missingZhCN += 1
      if (!zhHK) missingZhHK += 1
    }
    const missingAny = rows.reduce((acc, it) => {
      const zhCNKey = `${it.key}::zh-CN`
      const zhHKKey = `${it.key}::zh-HK`
      const zhCN = (literalsReviewDrafts[zhCNKey] ?? it.zhCN).trim()
      const zhHK = (literalsReviewDrafts[zhHKKey] ?? it.zhHK).trim()
      return acc + (!zhCN || !zhHK ? 1 : 0)
    }, 0)
    return {
      displayed: rows.length,
      loaded: literalsReviewItems.length,
      missingAny,
      missingZhCN,
      missingZhHK,
    }
  }, [literalsReviewDisplayed, literalsReviewDrafts, literalsReviewItems.length])

  // AI batching (items per provider request)
  const [batchSize, setBatchSize] = useState<number>(20)

  // Paging
  const TRANSLATIONS_PAGE_SIZE = 100
  const [translationsOffset, setTranslationsOffset] = useState(0)
  const [translationsHasMore, setTranslationsHasMore] = useState(false)
  const [translationsLoadingMore, setTranslationsLoadingMore] = useState(false)
  const translationsSentinelRef = useRef<HTMLDivElement | null>(null)

  // Bulk operations abort controller (used by literals bulk translate)
  const bulkAbortRef = useRef<AbortController | null>(null)

  // Codebase scan
  const [codeScanLoading, setCodeScanLoading] = useState(false)
  const [codeScanItems, setCodeScanItems] = useState<Array<{ text: string; key: string; namespace: 'literals'; file: string; line: number; kind: string }>>([])
  const [codeScanImporting, setCodeScanImporting] = useState(false)
  const [codeScanLast, setCodeScanLast] = useState<{
    at: number
    returned: number
    foundTotal?: number
    scanLimit?: number
    seeded?: number
  } | null>(null)
  const didInitLocaleRef = useRef(false)
  
  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editAiLoading, setEditAiLoading] = useState(false)
  
  // New translation state
  const [isAdding, setIsAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const supabase = useMemo(() => createClient(), [])

  const fetchLanguages = useCallback(async () => {
    const { data } = await supabase
      .from('system_languages')
      .select('*')
      .eq('is_active', true)
      .order('name')
    
    if (data) {
      const raw = data as any as Language[]
      const hasZHHK = raw.some((l) => l.code === 'zh-HK')

      const rows = raw
        .filter((l) => (hasZHHK ? l.code !== 'zh-TW' : true))
        .map((l) => {
          // Legacy: if DB still has zh-TW but not zh-HK, normalize it.
          if (!hasZHHK && l.code === 'zh-TW') {
            return { ...l, code: 'zh-HK', name: l.name || 'Chinese (Traditional)', flag_emoji: '🇭🇰' }
          }
          return l
        })

      const uniq = Array.from(new Map(rows.map((l) => [l.code, l])).values())
      const hasCurrent = uniq.some((l) => l.code === currentLocale)
      const next = hasCurrent ? uniq : [...uniq, { code: currentLocale, name: currentLocale, flag_emoji: '' }]
      setLanguages(next)
    }
  }, [supabase, currentLocale])

  const fetchTranslations = useCallback(async () => {
    setLoading(true)
    setTranslationsOffset(0)
    const { data, error } = await supabase
      .from('app_translations')
      .select('*')
      .eq('locale', selectedLocale)
      .eq('namespace', selectedNamespace)
      .order('key')
      .range(0, TRANSLATIONS_PAGE_SIZE - 1)

    if (error) {
      console.error('Error fetching translations:', error)
      setTranslations([])
      setTranslationsHasMore(false)
    } else {
      const rows = data || []
      setTranslations(rows)
      setTranslationsHasMore(rows.length === TRANSLATIONS_PAGE_SIZE)
    }
    setLoading(false)
  }, [supabase, selectedLocale, selectedNamespace])

  const loadMoreTranslations = useCallback(async () => {
    if (translationsLoadingMore || loading || !translationsHasMore) return
    setTranslationsLoadingMore(true)
    try {
      const nextOffset = translationsOffset + TRANSLATIONS_PAGE_SIZE
      const { data, error } = await supabase
        .from('app_translations')
        .select('*')
        .eq('locale', selectedLocale)
        .eq('namespace', selectedNamespace)
        .order('key')
        .range(nextOffset, nextOffset + TRANSLATIONS_PAGE_SIZE - 1)
      if (error) throw error
      const rows = data || []
      setTranslations((prev) => [...prev, ...rows])
      setTranslationsOffset(nextOffset)
      setTranslationsHasMore(rows.length === TRANSLATIONS_PAGE_SIZE)
    } catch (e) {
      console.error(e)
      toast.error('Failed to load more translations')
    } finally {
      setTranslationsLoadingMore(false)
    }
  }, [translationsLoadingMore, loading, translationsHasMore, translationsOffset, supabase, selectedLocale, selectedNamespace])

  const buildLiteralsReview = useCallback(
    async ({ offset, append }: { offset: number; append: boolean }) => {
      const q = literalsReviewQuery.trim()

      // Search needs to work across the full DB (not just the currently loaded page)
      // and should match Chinese translations too.
      let keys: string[] = []
      let enByKey: Record<string, string> = {}
      let hasMore = false

      if (q) {
        const limitKeys = 2000

        const { data: enMatches, error: enMatchErr } = await (supabase
          .from('app_translations')
          .select('key,value')
          .eq('locale', 'en')
          .eq('namespace', 'literals')
          .or(`key.ilike.%${q}%,value.ilike.%${q}%`)
          .limit(limitKeys) as any)
        if (enMatchErr) throw enMatchErr

        const { data: zhMatches, error: zhMatchErr } = await (supabase
          .from('app_translations')
          .select('locale,key,value')
          .eq('namespace', 'literals')
          .in('locale', ['zh-CN', 'zh-HK'])
          .ilike('value', `%${q}%`)
          .limit(limitKeys) as any)
        if (zhMatchErr) throw zhMatchErr

        const set = new Set<string>()
        for (const row of (enMatches || []) as Array<{ key: string; value: string }>) {
          if (!row?.key) continue
          set.add(row.key)
          enByKey[row.key] = String(row.value ?? '')
        }
        for (const row of (zhMatches || []) as Array<{ locale: string; key: string; value: string }>) {
          if (!row?.key) continue
          set.add(row.key)
        }

        const all = Array.from(set).sort((a, b) => a.localeCompare(b))
        const page = all.slice(offset, offset + LITERALS_REVIEW_PAGE_SIZE)
        keys = page
        hasMore = offset + LITERALS_REVIEW_PAGE_SIZE < all.length

        // Ensure we have English source values for all keys (so the table can render).
        const missingEnKeys = page.filter((k) => !(k in enByKey))
        if (missingEnKeys.length) {
          const { data: enRows2, error: enErr2 } = await (supabase
            .from('app_translations')
            .select('key,value')
            .eq('locale', 'en')
            .eq('namespace', 'literals')
            .in('key', missingEnKeys) as any)
          if (enErr2) throw enErr2
          for (const row of (enRows2 || []) as Array<{ key: string; value: string }>) {
            if (!row?.key) continue
            enByKey[row.key] = String(row.value ?? '')
          }
        }
      } else {
        const { data: enRows, error: enErr } = await (supabase
          .from('app_translations')
          .select('key,value')
          .eq('locale', 'en')
          .eq('namespace', 'literals')
          .order('key')
          .range(offset, offset + LITERALS_REVIEW_PAGE_SIZE - 1) as any)
        if (enErr) throw enErr

        const baseRows = (enRows || []) as Array<{ key: string; value: string }>
        keys = baseRows.map((r) => r.key)
        for (const row of baseRows) {
          if (!row?.key) continue
          enByKey[row.key] = String(row.value ?? '')
        }
        hasMore = baseRows.length === LITERALS_REVIEW_PAGE_SIZE
      }

      setLiteralsReviewOffset(offset)
      setLiteralsReviewHasMore(hasMore)

      if (keys.length === 0) {
        setLiteralsReviewItems((prev) => (append ? prev : []))
        return
      }

      const { data: locRows, error: locErr } = await (supabase
        .from('app_translations')
        .select('locale,key,value')
        .eq('namespace', 'literals')
        .in('locale', ['zh-CN', 'zh-HK'])
        .in('key', keys) as any)

      if (locErr) throw locErr

      const byKey: Record<string, { zhCN?: string; zhHK?: string }> = {}
      for (const row of (locRows || []) as Array<{ locale: string; key: string; value: string }>) {
        byKey[row.key] ||= {}
        if (row.locale === 'zh-CN') byKey[row.key].zhCN = row.value
        if (row.locale === 'zh-HK') byKey[row.key].zhHK = row.value
      }

      const items = keys.map((k) => ({
        key: k,
        en: enByKey[k] ?? '',
        zhCN: byKey[k]?.zhCN ?? '',
        zhHK: byKey[k]?.zhHK ?? '',
      }))

      setLiteralsReviewItems((prev) => (append ? [...prev, ...items] : items))
    },
    [supabase, literalsReviewQuery]
  )

  const refreshLiteralsReview = useCallback(async () => {
    setLiteralsReviewLoading(true)
    setLiteralsReviewDrafts({})
    try {
      // Always sync English literals from code scan so newly added lt('...') strings show up after Refresh.
      try {
        const res = await fetch('/api/admin/translations/code-scan?limit=5000&scanLimit=50000&seed=1', { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (res.ok) {
          const found = Array.isArray((json as any)?.found) ? ((json as any).found as any[]) : []
          const totals = (json as any)?.totals ?? {}
          setCodeScanLast({
            at: Date.now(),
            returned: Number(totals?.found ?? found.length) || found.length,
            foundTotal: Number(totals?.foundTotal ?? totals?.found ?? found.length) || found.length,
            scanLimit: Number(totals?.scanLimit ?? 0) || undefined,
            seeded: Number((json as any)?.seeded ?? 0) || 0,
          })
          setCodeScanItems(found)
        } else {
          // Not fatal, but it explains why literals might be missing from the review table.
          toast.error((json as any)?.error || 'Code scan failed')
        }
      } catch {
        toast.error('Code scan failed')
      }

      await buildLiteralsReview({ offset: 0, append: false })
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Failed to load literals')
      setLiteralsReviewItems([])
      setLiteralsReviewHasMore(false)
    } finally {
      setLiteralsReviewLoading(false)
    }
  }, [buildLiteralsReview])

  const runLiteralsReviewSearch = useCallback(async () => {
    setLiteralsReviewLoading(true)
    setLiteralsReviewDrafts({})
    try {
      await buildLiteralsReview({ offset: 0, append: false })
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Failed to load literals')
      setLiteralsReviewItems([])
      setLiteralsReviewHasMore(false)
    } finally {
      setLiteralsReviewLoading(false)
    }
  }, [buildLiteralsReview])

  useEffect(() => {
    // Search-as-you-type: debounce to avoid spamming DB.
    // Important: do NOT rerun code-scan here (that stays on explicit Refresh / initial load).
    const handle = setTimeout(() => {
      void runLiteralsReviewSearch()
    }, LITERALS_REVIEW_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [literalsReviewQuery, runLiteralsReviewSearch])

  const loadMoreLiteralsReview = useCallback(async () => {
    if (literalsReviewLoadingMore || literalsReviewLoading || !literalsReviewHasMore) return
    setLiteralsReviewLoadingMore(true)
    try {
      const nextOffset = literalsReviewOffset + LITERALS_REVIEW_PAGE_SIZE
      await buildLiteralsReview({ offset: nextOffset, append: true })
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Failed to load more literals')
    } finally {
      setLiteralsReviewLoadingMore(false)
    }
  }, [
    literalsReviewLoadingMore,
    literalsReviewLoading,
    literalsReviewHasMore,
    literalsReviewOffset,
    buildLiteralsReview,
  ])

  const saveLiteralsReviewRow = useCallback(
    async (key: string) => {
      const zhCN = (literalsReviewDrafts[`${key}::zh-CN`] ?? '').trim()
      const zhHK = (literalsReviewDrafts[`${key}::zh-HK`] ?? '').trim()

      const rows: Array<{ locale: string; namespace: string; key: string; value: string }> = []
      if (zhCN) rows.push({ locale: 'zh-CN', namespace: 'literals', key, value: zhCN })
      if (zhHK) rows.push({ locale: 'zh-HK', namespace: 'literals', key, value: zhHK })

      if (rows.length === 0) {
        toast.message('Nothing to save')
        return
      }

      const { error } = await (supabase.from('app_translations') as any).upsert(rows, {
        onConflict: 'locale,namespace,key',
      })
      if (error) throw error

      setLiteralsReviewItems((prev) =>
        prev.map((it) =>
          it.key === key
            ? {
                ...it,
                zhCN: zhCN || it.zhCN,
                zhHK: zhHK || it.zhHK,
              }
            : it
        )
      )

      setLiteralsReviewDrafts((prev) => {
        const next = { ...prev }
        delete next[`${key}::zh-CN`]
        delete next[`${key}::zh-HK`]
        return next
      })

      toast.success('Saved')
    },
    [supabase, literalsReviewDrafts]
  )

  // Infinite scroll: literals review list
  useEffect(() => {
    const el = literalsReviewSentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        if (literalsReviewLoading || literalsReviewLoadingMore || !literalsReviewHasMore) return
        void loadMoreLiteralsReview()
      },
      { root: null, rootMargin: '200px', threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [
    literalsReviewLoading,
    literalsReviewLoadingMore,
    literalsReviewHasMore,
    loadMoreLiteralsReview,
  ])

  // Infinite scroll: DB translations list
  useEffect(() => {
    const el = translationsSentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        // Paging only makes sense for the unfiltered list (we're not doing server-side search)
        if (searchQuery.trim() !== '') return
        if (loading || translationsLoadingMore || !translationsHasMore) return
        void loadMoreTranslations()
      },
      { root: null, rootMargin: '200px', threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [searchQuery, loading, translationsLoadingMore, translationsHasMore, loadMoreTranslations])

  const aiTranslateKey = useCallback(
    async (key: string, namespaceOverride?: string, targetLocaleOverride?: string, signal?: AbortSignal) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const maxAttempts = 3

      let lastErr: any = null
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

        try {
          const res = await fetch('/api/admin/translations/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceLocale,
              targetLocale: targetLocaleOverride ?? selectedLocale,
              namespace: namespaceOverride ?? selectedNamespace,
              key,
            }),
            signal,
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) {
            const err: any = new Error(json?.error || 'AI translation failed')
            err.status = res.status
            err.retryAfterSeconds = Number(res.headers.get('retry-after') || json?.retryAfterSeconds || 0) || null
            throw err
          }
          return String((json as any)?.translated ?? '').trim()
        } catch (e: any) {
          if (e?.name === 'AbortError') throw e
          lastErr = e

          const status = Number(e?.status)
          const retryable = status === 429 || status === 502 || status === 503 || status === 504
          if (!retryable || attempt === maxAttempts) break

          const baseDelayMs = 750
          const backoffMs = baseDelayMs * Math.pow(2, attempt - 1)
          const retryAfterMs = e?.retryAfterSeconds ? Number(e.retryAfterSeconds) * 1000 : 0
          const delayMs = Math.max(backoffMs, retryAfterMs)
          await sleep(delayMs)
        }
      }

      throw lastErr || new Error('AI translation failed')
    },
    [selectedLocale, selectedNamespace, sourceLocale]
  )

  const aiTranslateBatch = useCallback(
    async (
      items: Array<{ namespace: string; key: string; sourceValue: string }>,
      targetLocaleOverride?: string,
      signal?: AbortSignal
    ) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

      const callEndpoint = async () => {
        const maxAttempts = 3
        let lastErr: any = null
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
          try {
            const res = await fetch('/api/admin/translations/ai-batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sourceLocale,
                targetLocale: targetLocaleOverride ?? selectedLocale,
                items,
              }),
              signal,
            })

            const json = await res.json().catch(() => ({}))
            if (!res.ok) {
              const err: any = new Error((json as any)?.error || 'AI batch translation failed')
              err.status = res.status
              err.retryAfterSeconds =
                Number(res.headers.get('retry-after') || (json as any)?.retryAfterSeconds || 0) || null
              err.details = json
              throw err
            }

            const results = (json as any)?.results
            if (!results || typeof results !== 'object') throw new Error('AI batch returned invalid results')
            return results as Record<string, string>
          } catch (e: any) {
            if (e?.name === 'AbortError') throw e
            lastErr = e

            const status = Number(e?.status)
            const retryable = status === 429 || status === 503 || status === 504
            if (!retryable || attempt === maxAttempts) break

            const baseDelayMs = 750
            const backoffMs = baseDelayMs * Math.pow(2, attempt - 1)
            const retryAfterMs = e?.retryAfterSeconds ? Number(e.retryAfterSeconds) * 1000 : 0
            const delayMs = Math.max(backoffMs, retryAfterMs)
            await sleep(delayMs)
          }
        }

        throw lastErr || new Error('AI batch translation failed')
      }

      const translateWithSplit = async (
        batch: Array<{ namespace: string; key: string; sourceValue: string }>
      ): Promise<Record<string, string>> => {
        if (batch.length === 0) return {}
        if (batch.length === 1) {
          const it = batch[0]
          const translated = await aiTranslateKey(it.key, it.namespace, targetLocaleOverride, signal)
          return { [`${it.namespace}::${it.key}`]: translated }
        }

        try {
          return await callEndpoint()
        } catch (e: any) {
          // Many openrouter/free models occasionally produce malformed / incomplete JSON.
          // Split the batch and retry smaller pieces instead of failing the entire bulk run.
          const status = Number(e?.status)
          if (status === 502) {
            const mid = Math.ceil(batch.length / 2)
            const left = await translateWithSplit(batch.slice(0, mid))
            const right = await translateWithSplit(batch.slice(mid))
            return { ...left, ...right }
          }
          throw e
        }
      }

      return translateWithSplit(items)
    },
    [selectedLocale, sourceLocale, aiTranslateKey]
  )

  const effectiveBatchSize = useMemo(() => {
    const n = Number(batchSize)
    if (!Number.isFinite(n)) return 20
    return Math.min(50, Math.max(1, Math.floor(n)))
  }, [batchSize])

  const upsertLiteralTranslation = useCallback(
    async (key: string, locale: 'zh-CN' | 'zh-HK', value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return

      const { error } = await (supabase.from('app_translations') as any).upsert(
        [{ locale, namespace: 'literals', key, value: trimmed }],
        { onConflict: 'locale,namespace,key' }
      )
      if (error) throw error

      setLiteralsReviewItems((prev) =>
        prev.map((it) => {
          if (it.key !== key) return it
          if (locale === 'zh-CN') return { ...it, zhCN: trimmed }
          return { ...it, zhHK: trimmed }
        })
      )

      const draftKey = `${key}::${locale}`
      setLiteralsReviewDrafts((prev) => {
        const current = String(prev[draftKey] ?? '')
        if (current.trim() !== trimmed) return prev
        const next = { ...prev }
        delete next[draftKey]
        return next
      })
    },
    [supabase]
  )

  const queueLiteralsAutosave = useCallback(
    (key: string, locale: 'zh-CN' | 'zh-HK', nextValue: string, opts?: { immediate?: boolean }) => {
      if (literalsBulkRunning) return

      const timerKey = `${key}::${locale}`
      const trimmed = nextValue.trim()

      const existingTimer = literalsAutosaveTimersRef.current[timerKey]
      if (existingTimer) clearTimeout(existingTimer)
      literalsAutosaveTimersRef.current[timerKey] = null

      if (!trimmed) return

      const run = () => {
        void upsertLiteralTranslation(key, locale, trimmed).catch((e: any) => {
          console.error(e)
          toast.error(e?.message || 'Auto-save failed')
        })
      }

      if (opts?.immediate) {
        run()
        return
      }

      literalsAutosaveTimersRef.current[timerKey] = setTimeout(run, LITERALS_AUTOSAVE_DEBOUNCE_MS)
    },
    [upsertLiteralTranslation, literalsBulkRunning]
  )

  const handleAiForLiteralRow = useCallback(
    async (key: string) => {
      if (literalsBulkRunning) return

      setLiteralsReviewAiBusy((prev) => ({ ...prev, [key]: true }))
      try {
        const row = literalsReviewItems.find((r) => r.key === key)
        if (!row) return

        const zhCNKey = `${key}::zh-CN`
        const zhHKKey = `${key}::zh-HK`
        const existingZhCN = (literalsReviewDrafts[zhCNKey] ?? row.zhCN).trim()
        const existingZhHK = (literalsReviewDrafts[zhHKKey] ?? row.zhHK).trim()

        const tasks: Array<Promise<void>> = []
        if (!existingZhCN) {
          tasks.push(
            aiTranslateKey(key, 'literals', 'zh-CN').then((translated) => {
              return upsertLiteralTranslation(key, 'zh-CN', translated)
            })
          )
        }
        if (!existingZhHK) {
          tasks.push(
            aiTranslateKey(key, 'literals', 'zh-HK').then((translated) => {
              return upsertLiteralTranslation(key, 'zh-HK', translated)
            })
          )
        }

        if (tasks.length === 0) {
          toast.message('Nothing to translate')
          return
        }

        await Promise.all(tasks)

        // Ensure any stale drafts are cleared after AI write.
        setLiteralsReviewDrafts((prev) => {
          const next = { ...prev }
          delete next[zhCNKey]
          delete next[zhHKKey]
          return next
        })
      } catch (e: any) {
        console.error(e)
        toast.error(e?.message || 'AI translation failed')
      } finally {
        setLiteralsReviewAiBusy((prev) => ({ ...prev, [key]: false }))
      }
    },
    [
      aiTranslateKey,
      upsertLiteralTranslation,
      literalsReviewItems,
      literalsReviewDrafts,
      literalsBulkRunning,
    ]
  )

  const startBulkTranslateLiterals = useCallback(async () => {
    if (literalsBulkRunning) return

    const visible = literalsReviewDisplayed
    if (!visible.length) {
      toast.message('No literals to translate')
      return
    }

    // Only translate rows that are missing for each locale.
    const missingZhCN = visible.filter((it) => (it.zhCN || '').trim() === '')
    const missingZhHK = visible.filter((it) => (it.zhHK || '').trim() === '')

    if (missingZhCN.length === 0 && missingZhHK.length === 0) {
      toast.success('No missing literals')
      return
    }

    setLiteralsBulkRunning(true)
    setLiteralsBulkDone(0)
    setLiteralsBulkCurrent(null)

    const total = missingZhCN.length + missingZhHK.length
    setLiteralsBulkTotal(total)

    bulkAbortRef.current = new AbortController()

    try {
      const locales: Array<'zh-CN' | 'zh-HK'> = ['zh-CN', 'zh-HK']

      for (const locale of locales) {
        const missingList = locale === 'zh-CN' ? missingZhCN : missingZhHK
        for (let i = 0; i < missingList.length; i += effectiveBatchSize) {
          if (bulkAbortRef.current?.signal.aborted) break
          const batch = missingList.slice(i, i + effectiveBatchSize)
          if (!batch.length) continue

          setLiteralsBulkCurrent(
            `${locale} (${Math.min(i + batch.length, missingList.length)}/${missingList.length})`
          )

          const payload = batch.map((it) => ({
            namespace: 'literals',
            key: it.key,
            sourceValue: it.en,
          }))

          const results = await aiTranslateBatch(payload, locale, bulkAbortRef.current?.signal)
          if (bulkAbortRef.current?.signal.aborted) break

          const rows = payload
            .map((it) => ({
              locale,
              namespace: 'literals',
              key: it.key,
              value: String(results[`literals::${it.key}`] ?? '').trim(),
            }))
            .filter((r) => r.value)

          if (rows.length) {
            const { error } = await (supabase.from('app_translations') as any).upsert(rows, {
              onConflict: 'locale,namespace,key',
            })
            if (error) throw error
          }

          // Update local UI state
          setLiteralsReviewItems((prev) =>
            prev.map((it) => {
              const match = rows.find((r: any) => r.key === it.key)
              if (!match) return it
              if (match.locale === 'zh-CN') return { ...it, zhCN: match.value }
              if (match.locale === 'zh-HK') return { ...it, zhHK: match.value }
              return it
            })
          )

          setLiteralsBulkDone((x) => x + batch.length)
        }
      }

      toast.success('Bulk literals translation completed')
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Bulk literals translation failed')
    } finally {
      setLiteralsBulkRunning(false)
      setLiteralsBulkCurrent(null)
      bulkAbortRef.current = null
    }
  }, [
    literalsBulkRunning,
    literalsReviewDisplayed,
    aiTranslateBatch,
    effectiveBatchSize,
    supabase,
  ])

  const cancelBulk = useCallback(() => {
    bulkAbortRef.current?.abort()
  }, [])

  const scanCodebase = useCallback(async () => {
    setCodeScanLoading(true)
    try {
      const res = await fetch('/api/admin/translations/code-scan?limit=800', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to scan codebase')
      setCodeScanItems(Array.isArray(json?.found) ? json.found : [])
      const returned = Number(json?.totals?.found ?? (Array.isArray(json?.found) ? json.found.length : 0))
      const foundTotal = Number(json?.totals?.foundTotal ?? returned)
      const scanLimit = Number(json?.totals?.scanLimit ?? 0) || undefined
      setCodeScanLast({ at: Date.now(), returned, foundTotal, scanLimit, seeded: 0 })
      toast.success(
        foundTotal > returned
          ? `Found ${returned} strings (scanned ${foundTotal})`
          : `Found ${returned} strings`
      )
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Failed to scan codebase')
    } finally {
      setCodeScanLoading(false)
    }
  }, [])

  const importEnglishBase = useCallback(async () => {
    if (!codeScanItems.length) return
    setCodeScanImporting(true)
    try {
      const rows = codeScanItems.map((i) => ({
        locale: 'en',
        namespace: i.namespace,
        key: i.key,
        value: i.text,
      }))

      const { error } = await (supabase.from('app_translations') as any).upsert(rows, {
        onConflict: 'locale,namespace,key',
      })
      if (error) throw error
      toast.success('Imported English base strings to DB')
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Failed to import base strings')
    } finally {
      setCodeScanImporting(false)
    }
  }, [codeScanItems, supabase])

  useEffect(() => {
    fetchLanguages()
  }, [fetchLanguages])

  useEffect(() => {
    refreshLiteralsReview()
  }, [refreshLiteralsReview])

  useEffect(() => {
    if (didInitLocaleRef.current) return
    if (!currentLocale) return
    setSelectedLocale(currentLocale === 'zh-TW' ? 'zh-HK' : currentLocale)
    didInitLocaleRef.current = true
  }, [currentLocale])

  useEffect(() => {
    if (!selectedLocale || !selectedNamespace) return
    fetchTranslations()
  }, [selectedLocale, selectedNamespace, fetchTranslations])

  const handleAdd = async () => {
    if (!newKey || !newValue) return

    const { error } = await (supabase.from('app_translations') as any).insert([
      {
        locale: selectedLocale,
        namespace: selectedNamespace,
        key: newKey,
        value: newValue,
      },
    ])

    if (error) {
      console.error('Error adding translation:', error)
      toast.error('Failed to add translation. Key might already exist.')
    } else {
      toast.success('Translation added successfully')
      setNewKey('')
      setNewValue('')
      setIsAdding(false)
      fetchTranslations()
    }
  }

  const handleUpdate = async (id: string) => {
    const { error } = await (supabase
      .from('app_translations') as any)
      .update({ value: editValue })
      .eq('id', id)
    if (error) {
      console.error('Error updating translation:', error)
      toast.error('Failed to update translation')
    } else {
      toast.success('Translation updated successfully')
      setEditingId(null)
      fetchTranslations()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return

    const { error } = await (supabase
      .from('app_translations') as any)
      .delete()
      .eq('id', id)
    if (error) {
      console.error('Error deleting translation:', error)
      toast.error('Failed to delete translation')
    } else {
      toast.success('Translation deleted successfully')
      fetchTranslations()
    }
  }

  const filteredTranslations = translations.filter(
    (tr) =>
      tr.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tr.value.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Frontend literals review (English → zh-CN / zh-HK)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={refreshLiteralsReview} disabled={literalsReviewLoading}>
                {literalsReviewLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {lt('Refresh')}
              </Button>
              <Button
                onClick={startBulkTranslateLiterals}
                disabled={
                  literalsReviewLoading ||
                  literalsBulkRunning ||
                  literalsReviewDisplayed.length === 0
                }
              >
                <Wand2 className="w-4 h-4 mr-2" /> AI translate visible missing
              </Button>
              <div className="flex items-center gap-2 ml-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Batch size</span>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  value={batchSize}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (!Number.isFinite(n)) return
                    setBatchSize(n)
                  }}
                  className="h-8 w-24"
                  disabled={literalsBulkRunning}
                />
              </div>
              {literalsBulkRunning ? (
                <Button variant="outline" onClick={cancelBulk}>
                  {lt('Cancel')}
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={loadMoreLiteralsReview}
                disabled={literalsReviewLoadingMore || literalsReviewLoading || !literalsReviewHasMore}
              >
                {literalsReviewLoadingMore ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {lt('Load more')}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 mr-2">
                <Switch
                  checked={literalsReviewOnlyMissing}
                  onCheckedChange={(v) => setLiteralsReviewOnlyMissing(Boolean(v))}
                  disabled={literalsReviewLoading}
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">{lt('Only missing')}</span>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {literalsReviewStats.loaded ? (
                  <>
                    {literalsReviewStats.displayed} shown / {literalsReviewStats.loaded} loaded · Missing: {literalsReviewStats.missingAny} (zh-CN {literalsReviewStats.missingZhCN}, zh-HK {literalsReviewStats.missingZhHK})
                  </>
                ) : (
                  lt('0 loaded')
                )}
              </span>
              <Input
                placeholder={lt('Search literal key or English text…')}
                value={literalsReviewQuery}
                onChange={(e) => setLiteralsReviewQuery(e.target.value)}
                className="max-w-sm"
              />
              <Button variant="outline" onClick={runLiteralsReviewSearch} disabled={literalsReviewLoading}>
                {lt('Search')}
              </Button>
            </div>
          </div>

          {selectedNamespace === 'all' ? (
            <div className="text-xs text-muted-foreground">
              {lt('Tip: Select a specific namespace to manually add/edit rows in the DB table.')}
            </div>
          ) : null}

          {isAdding ? (
            <div className="border rounded p-4 space-y-3">
              <div className="text-xs text-muted-foreground">
                Adds a row to <span className="font-mono">app_translations</span> for locale{' '}
                <span className="font-mono">{selectedLocale}</span> and namespace{' '}
                <span className="font-mono">{selectedNamespace}</span>.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-2">
                  <Label>{lt('Key')}</Label>
                  <Input
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder={lt('e.g. save_button')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{lt('Value')}</Label>
                  <Input
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder={lt('Translated text')}
                  />
                </div>
                <Button onClick={handleAdd}>
                  <Save className="w-4 h-4 mr-2" /> {t('save')}
                </Button>
              </div>
            </div>
          ) : null}

          {codeScanLast ? (
            <div className="text-xs text-muted-foreground">
              Code scan: {codeScanLast.seeded ? `${codeScanLast.seeded} seeded, ` : ''}
              {codeScanLast.foundTotal && codeScanLast.foundTotal > codeScanLast.returned
                ? `${codeScanLast.returned} shown (scanned ${codeScanLast.foundTotal})`
                : `${codeScanLast.returned} found`}
              {codeScanLast.scanLimit ? `, scanLimit ${codeScanLast.scanLimit}` : ''}
            </div>
          ) : null}

          {literalsBulkRunning ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Translating {literalsBulkCurrent ?? '-'} ({literalsBulkDone}/{literalsBulkTotal})
                </span>
                <span>
                  {literalsBulkTotal ? Math.round((literalsBulkDone / literalsBulkTotal) * 100) : 0}%
                </span>
              </div>
              <Progress
                className="h-3"
                value={literalsBulkTotal ? Math.round((literalsBulkDone / literalsBulkTotal) * 100) : 0}
              />
            </div>
          ) : null}

          <div className="border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Key</TableHead>
                  <TableHead>English (source)</TableHead>
                  <TableHead>zh-CN</TableHead>
                  <TableHead>zh-HK</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {literalsReviewLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : literalsReviewDisplayed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                      No literals found.
                    </TableCell>
                  </TableRow>
                ) : (
                  literalsReviewDisplayed.map((it) => {
                    const zhCNKey = `${it.key}::zh-CN`
                    const zhHKKey = `${it.key}::zh-HK`
                    const zhCNDraft = literalsReviewDrafts[zhCNKey]
                    const zhHKDraft = literalsReviewDrafts[zhHKKey]
                    const hasZhCN = Boolean((zhCNDraft ?? it.zhCN).trim())
                    const hasZhHK = Boolean((zhHKDraft ?? it.zhHK).trim())
                    const missing = [!hasZhCN ? 'zh-CN' : null, !hasZhHK ? 'zh-HK' : null].filter(Boolean).join(', ')

                    return (
                      <TableRow key={it.key}>
                        <TableCell className="font-mono text-xs">{it.key}</TableCell>
                        <TableCell className="text-sm">{it.en}</TableCell>
                        <TableCell>
                          <Input
                            value={zhCNDraft ?? it.zhCN}
                            onChange={(e) => {
                              const nextValue = e.target.value
                              setLiteralsReviewDrafts((prev) => ({ ...prev, [zhCNKey]: nextValue }))
                              queueLiteralsAutosave(it.key, 'zh-CN', nextValue)
                            }}
                            onBlur={(e) => queueLiteralsAutosave(it.key, 'zh-CN', e.target.value, { immediate: true })}
                            placeholder={it.zhCN ? 'Edit zh-CN…' : 'Missing zh-CN…'}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={zhHKDraft ?? it.zhHK}
                            onChange={(e) => {
                              const nextValue = e.target.value
                              setLiteralsReviewDrafts((prev) => ({ ...prev, [zhHKKey]: nextValue }))
                              queueLiteralsAutosave(it.key, 'zh-HK', nextValue)
                            }}
                            onBlur={(e) => queueLiteralsAutosave(it.key, 'zh-HK', e.target.value, { immediate: true })}
                            placeholder={it.zhHK ? 'Edit zh-HK…' : 'Missing zh-HK…'}
                            className="h-8"
                          />
                          {missing ? (
                            <div className="text-[11px] text-muted-foreground mt-1">Missing: {missing}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleAiForLiteralRow(it.key)}
                              disabled={
                                literalsReviewLoading ||
                                literalsBulkRunning ||
                                Boolean(literalsReviewAiBusy[it.key])
                              }
                            >
                              {literalsReviewAiBusy[it.key] ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Wand2 className="w-4 h-4" />
                              )}
                            </Button>
                            <Button size="sm" onClick={() => saveLiteralsReviewRow(it.key)}>
                              <Save className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div ref={literalsReviewSentinelRef} className="h-10" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Codebase strings (hardcoded English)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={scanCodebase} disabled={codeScanLoading || codeScanImporting}>
                {codeScanLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Scan codebase
              </Button>
              <Button onClick={importEnglishBase} disabled={codeScanImporting || codeScanItems.length === 0}>
                <Save className="w-4 h-4 mr-2" /> Import English base
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {codeScanLast?.foundTotal && codeScanLast.foundTotal > codeScanLast.returned
                ? `${codeScanLast.returned} shown (scanned ${codeScanLast.foundTotal})`
                : `${codeScanItems.length} found`}
            </div>
          </div>

          <div className="border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Key</TableHead>
                  <TableHead>English string</TableHead>
                  <TableHead className="w-[260px]">Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codeScanLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : codeScanItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                      No codebase strings scanned yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  codeScanItems.slice(0, 40).map((i) => (
                    <TableRow key={`${i.key}::${i.file}::${i.line}`}>
                      <TableCell className="font-mono text-sm">{i.key}</TableCell>
                      <TableCell className="text-sm">{i.text}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {i.file}:{i.line}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {codeScanItems.length > 40 ? (
            <div className="text-xs text-muted-foreground">Showing first 40 items.</div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-end">
            <div className="flex gap-4 w-full md:w-auto">
              <div className="w-48">
                <Label className="text-xs mb-1 block">Language</Label>
                <Select value={selectedLocale} onValueChange={setSelectedLocale}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.flag_emoji} {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-48">
                <Label className="text-xs mb-1 block">Namespace</Label>
                <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NAMESPACES.map((ns) => (
                      <SelectItem key={ns} value={ns}>
                        {ns}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center space-x-2 w-full md:w-auto">
              <Search className="w-4 h-4 text-gray-500" />
              <Input
                placeholder={lt('Search keys or values...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full md:w-[360px]"
              />
            </div>
          </div>

          {selectedNamespace === 'all' ? (
            <div className="text-xs text-muted-foreground">
              {lt('Tip: Use')}{' '}
              <span className="font-mono">namespace=all</span>{' '}
              {lt('to scan/AI-translate the entire UI.')}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {selectedNamespace === 'all' ? (
            <div className="p-4 text-sm text-muted-foreground">
              Select a specific namespace to view/edit DB translations in a single table.
              For hashed UI literals, use the Frontend literals review table above.
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredTranslations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    No translations found in database for this namespace.
                    <br />
                    <span className="text-xs">
                      (Default file-based translations are used if not overridden here)
                    </span>
                  </TableCell>
                </TableRow>
              ) : (
                filteredTranslations.map((tr) => (
                  <TableRow key={tr.id}>
                    <TableCell className="font-mono text-sm">{tr.key}</TableCell>
                    <TableCell>
                      {editingId === tr.id ? (
                        <div className="flex gap-2">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-8"
                          />
                            <Button
                              size="sm"
                              type="button"
                              variant="secondary"
                              disabled={editAiLoading}
                              onClick={async () => {
                                setEditAiLoading(true)
                                try {
                                  const translated = await aiTranslateKey(tr.key)
                                  setEditValue(translated)
                                } catch (e: any) {
                                  console.error(e)
                                  toast.error(e?.message || 'AI translation failed')
                                } finally {
                                  setEditAiLoading(false)
                                }
                              }}
                            >
                              {editAiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                            </Button>
                          <Button size="sm" onClick={() => handleUpdate(tr.id)}>
                            <Save className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="cursor-pointer hover:underline decoration-dotted"
                          onClick={() => {
                            setEditingId(tr.id)
                            setEditValue(tr.value)
                          }}
                        >
                          {tr.value}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(tr.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          )}

          <div ref={translationsSentinelRef} className="h-10" />
          {translationsLoadingMore ? (
            <div className="flex justify-center p-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
