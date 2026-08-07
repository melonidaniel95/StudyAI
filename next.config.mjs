/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /*
   * Cartella di output della build.
   * Su Windows, se il progetto si trova dentro OneDrive, la sincronizzazione
   * trasforma alcune cartelle in reparse point e Node fallisce con
   * "EINVAL: invalid argument, readlink ... app\(app)".
   * In quel caso imposta NEXT_DIST_DIR su un percorso fuori da OneDrive,
   * per esempio:  set NEXT_DIST_DIR=C:\Temp\studyos-next
   * La soluzione definitiva resta spostare il progetto fuori da OneDrive.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
