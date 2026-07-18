/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mengaktifkan Static Export agar Next.js menghasilkan file HTML/CSS/JS statis yang bisa di-host di GitHub Pages
  output: 'export',
  
  // Mematikan optimasi gambar bawaan Next.js (next/image) karena serverless image optimization 
  // tidak didukung pada hosting statis seperti GitHub Pages.
  images: {
    unoptimized: true,
  },
  basePath: '/Notulensi-Rapat',

  // CATATAN UNTUK DEPLOYMENT KE SUB-FOLDER REPOSITORY GITHUB PAGES:
  // Jika nama repositori Anda di GitHub bukan 'username.github.io' melainkan sub-folder seperti 'username.github.io/nama-repo',
  // aktifkan dan sesuaikan parameter 'basePath' di bawah ini dengan nama repositori Anda (diawali garis miring /).
  // Contoh jika nama repositori Anda adalah 'sistem-notulensi-pa-paniai':
  // basePath: '/sistem-notulensi-pa-paniai',
};

export default nextConfig;
