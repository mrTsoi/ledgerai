'use client'

import Image from 'next/image'

type Props = {
  src: string
  alt: string
  className?: string
  style?: React.CSSProperties
}

export function ImagePreview({ src, alt, className, style }: Props) {
  // Next/Image can't optimize blob: URLs or data: URLs.
  // Using unoptimized keeps the same behavior as <img> while avoiding the lint warning.
  return (
    <Image
      src={src}
      alt={alt}
      width={1600}
      height={1600}
      unoptimized
      className={className}
      style={style}
    />
  )
}
