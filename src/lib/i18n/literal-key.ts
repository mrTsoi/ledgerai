function rotl(n: number, s: number) {
  return (n << s) | (n >>> (32 - s))
}

function toHex8(n: number) {
  return (n >>> 0).toString(16).padStart(8, '0')
}

// Minimal SHA-1 implementation (sync, no Node crypto/WebCrypto).
// Used to create stable translation keys for hardcoded English strings.
export function sha1Hex(input: string): string {
  const msg = new TextEncoder().encode(input)
  const ml = msg.length * 8

  // Pre-processing: padding
  const withOne = new Uint8Array(msg.length + 1)
  withOne.set(msg)
  withOne[msg.length] = 0x80

  // length (64-bit big-endian) appended after padding to 56 mod 64
  let paddedLen = withOne.length
  while ((paddedLen % 64) !== 56) paddedLen++

  const padded = new Uint8Array(paddedLen + 8)
  padded.set(withOne)

  // append ml as 64-bit big-endian
  const view = new DataView(padded.buffer)
  const hi = Math.floor(ml / 0x100000000)
  const lo = ml >>> 0
  view.setUint32(paddedLen, hi, false)
  view.setUint32(paddedLen + 4, lo, false)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  const w = new Uint32Array(80)

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false)
    }
    for (let i = 16; i < 80; i++) {
      w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1) >>> 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let i = 0; i < 80; i++) {
      let f = 0
      let k = 0
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }

      const temp = (rotl(a, 5) + f + e + k + w[i]) >>> 0
      e = d
      d = c
      c = rotl(b, 30) >>> 0
      b = a
      a = temp
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  return `${toHex8(h0)}${toHex8(h1)}${toHex8(h2)}${toHex8(h3)}${toHex8(h4)}`
}

export function literalKeyFromText(text: string): string {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  const hex = sha1Hex(normalized).slice(0, 12)
  return `literal.${hex}`
}
