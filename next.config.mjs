import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin(
  './src/i18n/request.ts'
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        // allow any supabase project host (storage.public)
        hostname: '**.supabase.co',
        pathname: '/**',
      },
    ],
  },
  // Add any other Next.js config here
  webpack: (config, { isServer }) => {
    if (isServer) {
      // `ssh2` optionally requires native addons (cpu-features, sshcrypto.node) inside try/catch.
      // When bundling server routes, webpack may warn about missing optional deps.
      // Mark them as externals so runtime `require()` behaves normally (throws -> caught -> fallback).
      const externals = config.externals || []
      config.externals = [
        ...externals,
        'cpu-features',
        ({ request }, callback) => {
          if (request && typeof request === 'string' && request.endsWith('sshcrypto.node')) {
            return callback(null, `commonjs ${request}`)
          }
          callback()
        },
      ]
    }

    return config
  },
};

export default withNextIntl(nextConfig);
