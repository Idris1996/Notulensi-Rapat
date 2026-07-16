# Panduan Deploy Next.js - Sistem Notulensi Digital PA Paniai 🚀

Repositori ini berisi versi mandiri **Next.js (App Router)** yang dirancang khusus untuk dideploy langsung ke **Vercel** atau platform hosting modern lainnya.

---

## 📂 Struktur Folder
- `app/page.js`: Frontend UI yang responsif (Mobile First), dilengkapi pencatatan suara (MediaRecorder API), visualizer, dan pengunggah file.
- `app/api/generate/route.js`: API Route Next.js yang menangani pengunggahan file dan pemrosesan transkripsi/formatting menggunakan model **Gemini 3.5-flash** secara server-side dan aman.
- `package.json`: Konfigurasi dependensi modular modern (`@google/genai`, `lucide-react`, `react-markdown`).

---

## 🛠️ Langkah-Langkah Deploy ke Vercel

### 1. Persiapan Repositori Git
Unggah isi folder `/nextjs_version` ini ke dalam repositori GitHub Anda:
1. Buat repositori baru di GitHub (misalnya: `notulensi-pa-paniai`).
2. Masuk ke folder `/nextjs_version` di komputer lokal Anda.
3. Jalankan perintah terminal berikut:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Next.js Notulensi Digital"
   git branch -M main
   git remote add origin <URL_REPOS_GITHUB_ANDA>
   git push -u origin main
   ```

### 2. Hubungkan Repositori ke Vercel
1. Masuk ke dashboard [Vercel](https://vercel.com/) menggunakan akun Anda (atau buat baru menggunakan opsi login GitHub).
2. Klik tombol **"Add New"** lalu pilih **"Project"**.
3. Cari repositori `notulensi-pa-paniai` yang telah Anda buat di GitHub, lalu klik **"Import"**.

### 3. Konfigurasi Environment Variable di Vercel (CRITICAL)
Sebelum mengklik tombol **"Deploy"**, tambahkan Environment Variable rahasia agar sistem dapat terhubung dengan AI Gemini:

1. Pada bagian **"Environment Variables"** di konfigurasi proyek Vercel Anda, masukkan nilai berikut:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: *(Masukkan Kunci API Gemini Anda dari Google AI Studio)*
2. Klik **"Add"** untuk mengonfirmasi.

> ⚠️ **Catatan Keamanan**: Kunci API disimpan dengan aman di server Vercel dan tidak akan pernah bocor ke browser pengguna (Client-Side). Semua panggilan API dijembatani melalui server Next.js di `/api/generate`.

### 4. Deploy!
1. Klik tombol **"Deploy"** di bagian bawah dashboard Vercel.
2. Tunggu proses build selesai (~1-2 menit).
3. Setelah selesai, Vercel akan memberikan domain gratis (misal: `https://notulensi-pa-paniai.vercel.app`) yang siap diakses langsung melalui HP, tablet, maupun laptop!

---

## ⚙️ Pengembangan Lokal (Local Development)
Jika Anda ingin mencoba menjalankan aplikasi ini di komputer lokal Anda:
1. Pastikan Anda memiliki **Node.js v18+** terinstal.
2. Di terminal komputer Anda, jalankan:
   ```bash
   npm install
   ```
3. Buat file bernama `.env.local` di folder root Next.js Anda dan isi dengan:
   ```env
   GEMINI_API_KEY=KUNCI_API_GEMINI_ANDA
   ```
4. Jalankan server pengembangan lokal:
   ```bash
   npm run dev
   ```
5. Buka [http://localhost:3000](http://localhost:3000) di browser Anda untuk mulai menguji.

---

### PTA Jayapura - Pengadilan Agama Paniai 🏛️
*Sistem otomatisasi notulen dinas terenkripsi menggunakan Google Gemini AI.*
