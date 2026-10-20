// Bản build (npm run build) xuất HTML tĩnh ra ui/out; server.jar và client.jar tự phục vụ thư mục này.
// Khi phát triển (npm run dev:admin / dev:branch), /api được chuyển tiếp sang Java đang chạy.
const isDev = process.env.NODE_ENV === "development";
const apiTarget = process.env.API_TARGET ?? "http://127.0.0.1:8080";

/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  ...(isDev
    ? {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${apiTarget}/api/:path*` }];
        },
      }
    : { output: "export" }),
};

export default nextConfig;
