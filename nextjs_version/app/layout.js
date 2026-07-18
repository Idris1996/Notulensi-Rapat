import "./globals.css";

export const metadata = {
  title: "Notulensi Digital PA Paniai 🏛️",
  description: "Sistem otomatisasi notulen dinas terenkripsi menggunakan Google Gemini AI.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen bg-[#faf9f6]">
        {children}
      </body>
    </html>
  );
}
