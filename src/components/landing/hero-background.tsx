"use client"

/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useMemo, useRef, useState } from 'react'

type HeroMediaItem = {
  type: 'video' | 'image'
  url: string
  duration_seconds?: number
}

type HeroBackgroundProps = {
  className?: string
  media?: HeroMediaItem[]
  rotationSeconds?: number
  overlayOpacity?: number
}

/**
 * Marketing hero background.
 * - Can rotate through a configured list of videos/images.
 * - Falls back to NEXT_PUBLIC_HERO_VIDEO_URL, then to an original SVG background.
 */
export function HeroBackground({
  className,
  media,
  rotationSeconds = 12,
  overlayOpacity = 0.45,
}: HeroBackgroundProps) {
  const envVideoUrl = process.env.NEXT_PUBLIC_HERO_VIDEO_URL

  const items: HeroMediaItem[] = useMemo(() => {
    const fromConfig: HeroMediaItem[] = Array.isArray(media)
      ? media
          .map((m): HeroMediaItem | null => {
            const type: HeroMediaItem['type'] = m?.type === 'image' ? 'image' : 'video'
            const url = String(m?.url ?? '').trim()
            if (!url) return null

            const duration_seconds =
              typeof m?.duration_seconds === 'number' && Number.isFinite(m.duration_seconds)
                ? m.duration_seconds
                : undefined

            return { type, url, duration_seconds }
          })
          .filter((m): m is HeroMediaItem => Boolean(m))
      : []

    if (fromConfig.length > 0) return fromConfig
    if (envVideoUrl && envVideoUrl.trim()) return [{ type: 'video', url: envVideoUrl.trim() }]
    return []
  }, [media, envVideoUrl])

  const [activeIndex, setActiveIndex] = useState(0)
  const [previousIndex, setPreviousIndex] = useState<number | null>(null)
  const [fadePhase, setFadePhase] = useState<0 | 1>(0)

  const fadeMs = 900
  const activeDurationMs = useMemo(() => {
    const item = items[activeIndex]
    const seconds = item?.duration_seconds ?? rotationSeconds
    return Math.max(4, seconds) * 1000
  }, [items, activeIndex, rotationSeconds])

  const timeoutRef = useRef<number | null>(null)
  const fadeTimeoutRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (items.length === 0) return
    if (activeIndex < items.length) return
    setActiveIndex(0)
    setPreviousIndex(null)
    setFadePhase(0)
  }, [items.length, activeIndex])

  useEffect(() => {
    if (items.length <= 1) return
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    if (fadeTimeoutRef.current) window.clearTimeout(fadeTimeoutRef.current)
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current)

    timeoutRef.current = window.setTimeout(() => {
      const nextIndex = (activeIndex + 1) % items.length

      setPreviousIndex(activeIndex)
      setActiveIndex(nextIndex)
      setFadePhase(0)

      // Trigger the CSS transition on the next frame.
      rafRef.current = window.requestAnimationFrame(() => setFadePhase(1))

      fadeTimeoutRef.current = window.setTimeout(() => {
        setPreviousIndex(null)
        setFadePhase(0)
      }, fadeMs)
    }, activeDurationMs)

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      if (fadeTimeoutRef.current) window.clearTimeout(fadeTimeoutRef.current)
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
    }
  }, [items.length, activeIndex, activeDurationMs])

  return (
    <div className={className} aria-hidden>
      {/* Base gradient wash */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-white to-gray-50" />

      {/* Optional rotating media (video/image). If none provided, fall back to SVG. */}
      {items.length > 0 ? (
        <div className="absolute inset-0">
          {previousIndex !== null && items[previousIndex] ? (
            <div
              className="absolute inset-0 transition-opacity"
              style={{
                opacity: fadePhase === 1 ? 0 : 1,
                transitionDuration: `${fadeMs}ms`,
              }}
            >
              <MediaLayer item={items[previousIndex]} />
            </div>
          ) : null}

          <div
            className="absolute inset-0 transition-opacity"
            style={{
              opacity: previousIndex !== null ? (fadePhase === 1 ? 1 : 0) : 1,
              transitionDuration: `${fadeMs}ms`,
            }}
          >
            <MediaLayer item={items[activeIndex]} />
          </div>

          <div
            className="absolute inset-0"
            style={{
              backgroundColor: `rgba(255,255,255,${Math.min(0.9, Math.max(0, overlayOpacity))})`,
            }}
          />
        </div>
      ) : (
        <div className="absolute inset-0 overflow-hidden">
          <svg
            className="absolute -top-24 left-1/2 h-[900px] w-[1200px] -translate-x-1/2 motion-safe:animate-[hero-drift_16s_ease-in-out_infinite_alternate]"
            viewBox="0 0 1200 900"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="presentation"
          >
            <defs>
              <radialGradient id="g1" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(420 360) rotate(90) scale(420)">
                <stop stopColor="rgb(37 99 235)" stopOpacity="0.18" />
                <stop offset="1" stopColor="rgb(37 99 235)" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="g2" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(780 420) rotate(90) scale(440)">
                <stop stopColor="rgb(99 102 241)" stopOpacity="0.14" />
                <stop offset="1" stopColor="rgb(99 102 241)" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect width="1200" height="900" fill="url(#g1)" />
            <rect width="1200" height="900" fill="url(#g2)" />

            {/* Soft grid lines */}
            <g opacity="0.25">
              {Array.from({ length: 14 }).map((_, i) => (
                <line
                  key={`v-${i}`}
                  x1={120 + i * 70}
                  y1={90}
                  x2={120 + i * 70}
                  y2={810}
                  stroke="rgb(15 23 42)"
                  strokeOpacity="0.10"
                />
              ))}
              {Array.from({ length: 10 }).map((_, i) => (
                <line
                  key={`h-${i}`}
                  x1={80}
                  y1={140 + i * 70}
                  x2={1120}
                  y2={140 + i * 70}
                  stroke="rgb(15 23 42)"
                  strokeOpacity="0.08"
                />
              ))}
            </g>
          </svg>

          {/* Floating accent dots */}
          <div className="absolute left-1/2 top-24 h-2.5 w-2.5 -translate-x-[420px] rounded-full bg-blue-600/45 motion-safe:animate-[hero-bob_2.8s_ease-in-out_infinite]" />
          <div className="absolute left-1/2 top-64 h-2.5 w-2.5 -translate-x-[240px] rounded-full bg-blue-600/35 motion-safe:animate-[hero-bob_3.2s_ease-in-out_infinite] [animation-delay:280ms]" />
          <div className="absolute left-1/2 top-40 h-2.5 w-2.5 translate-x-[360px] rounded-full bg-blue-600/35 motion-safe:animate-[hero-bob_3.6s_ease-in-out_infinite] [animation-delay:520ms]" />
        </div>
      )}

      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-white" />
    </div>
  )
}

function MediaLayer({ item }: { item: HeroMediaItem }) {
  if (item.type === 'image') {
    return (
      <img
        src={item.url}
        alt=""
        className="h-full w-full object-cover opacity-55 motion-safe:animate-[hero-kenburns_14s_ease-in-out_infinite_alternate]"
        loading="eager"
        decoding="async"
      />
    )
  }

  return (
    <video
      className="h-full w-full object-cover opacity-45 motion-safe:animate-[hero-kenburns_18s_ease-in-out_infinite_alternate]"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
    >
      <source src={item.url} type="video/mp4" />
    </video>
  )
}
