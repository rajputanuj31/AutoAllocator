/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://16.112.69.231/:path*",
      },
    ];
  },
};

export default nextConfig;
