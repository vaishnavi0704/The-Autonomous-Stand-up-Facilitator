/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Handle node modules that need to be externalized
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      };
    }
    
    // Handle WebRTC and media stream APIs
    config.module.rules.push({
      test: /\.m?js$/,
      resolve: {
        fullySpecified: false,
      },
    });
    
    return config;
  },
  // Enable experimental features for better LiveKit compatibility
  experimental: {
    // Remove esmExternals as it's deprecated in Next.js 15
  },
  // Transpile LiveKit packages
  transpilePackages: ['livekit-client'],
}

module.exports = nextConfig