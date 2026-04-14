/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse', 'mammoth'],
  // Disable @vercel/blob SDK retries so upload errors surface immediately
  // instead of retrying with exponential backoff for ~17 minutes.
  env: {
    VERCEL_BLOB_RETRIES: '0',
  },
};

export default nextConfig;
