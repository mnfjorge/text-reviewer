/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // pdf-parse is pinned to 1.x; do not externalize it — Next/Turbopack can keep a stale
  // external map pointing at v2’s dist/…/index.cjs after a version change.
  serverExternalPackages: ['mammoth'],
};

export default nextConfig;
