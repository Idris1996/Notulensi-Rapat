# Panduan Deploy Backend - Sistem Notulensi Digital PA Paniai (Render.com) 🚀

Repositori ini berisi backend berbasis **Node.js + Express** dan **Multer** untuk menangani pengunggahan file audio besar (hingga 100MB) dan pemrosesan transkripsi menggunakan **Gemini 1.5-flash**. Ini dirancang khusus untuk memintas batasan payload 4.5MB di Vercel Serverless Functions.

---

## 📂 Struktur File Backend
- `server.js`: Server Express utama yang menangani CORS, upload file (Multer Memory Storage), penyusunan draf naskah dinas resmi PA Paniai via API Gemini, Ringkasan Eksekutif (JSON array), dan ekspor dokumen Word (.docx).
- `package.json`: Pengaturan dependensi modular (`express`, `multer`, `cors`, `@google/generative-ai`, `docx`, `dotenv`).
- `kop surat.png`: Gambar logo resmi kop surat Pengadilan Agama Paniai untuk disematkan secara otomatis di dokumen Word hasil unduhan.

---

## 🛠️ Langkah-Langkah Deploy ke Render.com

### 1. Unggah Berkas ke GitHub
Buat repositori baru di GitHub (misal: `notulensi-backend-paniai`) dan unggah seluruh isi folder `/backend_render` ke dalamnya:
1. Jalankan perintah ini di dalam folder `/backend_render`:
   ```bash
   git init
   git add .
   git commit -m "Deploy backend Notulensi PA Paniai"
   git branch -M main
   git remote add origin <URL_REPOS_GITHUB_ANDA>
   git push -u origin main
   ```

### 2. Hubungkan ke Render.com
1. Masuk ke dashboard [Render](https://render.com/) (buat akun gratis jika belum ada).
2. Klik tombol **"New +"** berwarna biru di pojok kanan atas, lalu pilih **"Web Service"**.
3. Hubungkan akun GitHub Anda dan pilih repositori `notulensi-backend-paniai`.
4. Berikan nama layanan (misal: `pa-paniai-notulen-backend`).
5. Atur setelan berikut:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free` (Gratis)

### 3. Tambahkan Environment Variable (CRITICAL)
Satu-satunya konfigurasi krusial yang wajib diisi adalah API Key Gemini:
1. Pada menu navigasi kiri di Render, pilih menu **"Environment"**.
2. Klik **"Add Environment Variable"**:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: *(Masukkan Kunci API Gemini Anda dari Google AI Studio)*
3. Klik **"Save Changes"**.

### 4. Dapatkan URL Backend Anda
Setelah proses deployment selesai, Render akan memberikan URL publik dinamis di bagian atas layar dashboard (biasanya berbentuk `https://pa-paniai-notulen-backend.onrender.com`).
**Salin URL ini** untuk dipasang sebagai `NEXT_PUBLIC_BACKEND_URL` pada frontend Next.js Anda di Vercel.

---

## 🏛️ Pengadilan Agama Paniai • Mahkamah Agung RI
*Solusi digital pengolah audio rapat besar menggunakan Node.js, Express, dan Gemini AI.*
