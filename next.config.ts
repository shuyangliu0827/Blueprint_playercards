import type { NextConfig } from 'next';
const config: NextConfig = {
  outputFileTracingIncludes: { '/api/preview': ['./config/**/*'], '/api/generate': ['./config/**/*'] },
  poweredByHeader: false,
  async redirects(){return [{source:'/motion/:path*',destination:'/debug/foil',permanent:false}];},
  async headers() { return [{ source:'/(.*)', headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'same-origin'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'}] }]; }
};
export default config;
