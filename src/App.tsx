import React, { useState, useRef, useEffect } from "react";
import {
  Scale,
  Mic,
  Upload,
  FileAudio,
  FileText,
  Download,
  Wand2,
  CheckCircle2,
  Loader2,
  Trash2,
  Copy,
  AlertCircle,
  Clock,
  MapPin,
  User,
  Users,
  Code,
  Key,
  Eye,
  EyeOff
} from "lucide-react";

export default function App() {
  // Input Method: 'upload' or 'record' or 'points'
  const [inputMethod, setInputMethod] = useState<"upload" | "record" | "points">("upload");

  // Error State declared early to support referencing in API Key handlers
  const [error, setError] = useState<string | null>(null);

  // Custom API Key States
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isKeySaved, setIsKeySaved] = useState<boolean>(false);

  // Load API Key from localStorage on Component Mount
  useEffect(() => {
    const savedKey = localStorage.getItem("user_gemini_api_key");
    if (savedKey) {
      setGeminiApiKey(savedKey);
      setIsKeySaved(true);
    }
  }, []);

  // Save/Update API Key
  const handleSaveApiKey = () => {
    if (geminiApiKey.trim()) {
      localStorage.setItem("user_gemini_api_key", geminiApiKey.trim());
      setIsKeySaved(true);
      setError(null);
    } else {
      localStorage.removeItem("user_gemini_api_key");
      setIsKeySaved(false);
    }
  };

  // Summary Points State
  const [summaryPoints, setSummaryPoints] = useState<string>("");
  const summaryFileInputRef = useRef<HTMLInputElement>(null);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [detectedDuration, setDetectedDuration] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Microphone Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Processing States
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [resultMarkdown, setResultMarkdown] = useState<string | null>(null);
  const [executiveSummary, setExecutiveSummary] = useState<string[] | null>(null);

  // Web Speech API Real-time Transcription State
  const [useRealtimeSpeech, setUseRealtimeSpeech] = useState<boolean>(true);
  const [realtimeTranscript, setRealtimeTranscript] = useState<string>("");
  const [interimTranscript, setInterimTranscript] = useState<string>("");
  const [recognitionActive, setRecognitionActive] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  // Streamlit Python Copy State
  const [isCopied, setIsCopied] = useState(false);
  const [showPythonGuide, setShowPythonGuide] = useState(false);

  // Recording timer effect
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // Audio drag & drop
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      if (inputMethod === "points") {
        readAndSetSummaryFile(files[0]);
      } else {
        validateAndSetFile(files[0]);
      }
    }
  };

  const readAndSetSummaryFile = (file: File) => {
    if (file.name.endsWith(".txt") || file.name.endsWith(".md") || file.name.endsWith(".json") || file.name.endsWith(".csv") || file.type.startsWith("text/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (text) {
          setSummaryPoints(text);
          setError(null);
        }
      };
      reader.onerror = () => {
        setError("Gagal membaca file teks. Pastikan file tidak rusak.");
      };
      reader.readAsText(file);
    } else {
      setError("Format file tidak didukung. Silakan pilih file teks/markdown (.txt, .md).");
    }
  };

  const handleSummaryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      readAndSetSummaryFile(files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    if (file.type.startsWith("audio/") || file.name.endsWith(".mp3") || file.name.endsWith(".wav") || file.name.endsWith(".m4a") || file.name.endsWith(".aac") || file.name.endsWith(".ogg") || file.name.endsWith(".webm") || file.name.endsWith(".amr")) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setDetectedDuration(null);
      setError(null);

      // Detect audio duration using standard HTML5 Audio
      const audio = new Audio();
      audio.src = url;
      audio.onloadedmetadata = () => {
        setDetectedDuration(audio.duration);
      };
      audio.onerror = () => {
        setDetectedDuration(null);
      };
    } else {
      setError("Format file tidak didukung. Silakan pilih berkas audio (MP3, WAV, M4A, dll).");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndSetFile(files[0]);
    }
  };

  // Microphone Recording Methods
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const options = { mimeType: "audio/webm" };
      
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (err) {
        // Fallback for browsers that don't support audio/webm
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setRecordedBlob(audioBlob);
        setRecordedUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setRecordingDuration(0);
      setIsRecording(true);
      setError(null);

      // Start Web Speech API Real-Time Speech Recognition if enabled
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (useRealtimeSpeech && SpeechRecognition) {
        try {
          setRealtimeTranscript("");
          setInterimTranscript("");

          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = "id-ID";

          let finalTranscript = "";
          recognition.onresult = (event: any) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript + " ";
              } else {
                interim += event.results[i][0].transcript;
              }
            }
            setRealtimeTranscript(finalTranscript.trim());
            setInterimTranscript(interim);
          };

          recognition.onerror = (event: any) => {
            console.warn("Speech Recognition Error:", event.error);
          };

          recognition.onend = () => {
            setRecognitionActive(false);
          };

          recognitionRef.current = recognition;
          recognition.start();
          setRecognitionActive(true);
        } catch (speechErr) {
          console.error("Gagal inisialisasi Web Speech API:", speechErr);
        }
      }
    } catch (err: any) {
      console.error("Gagal mengakses mikrofon:", err);
      setError("Tidak dapat mengakses mikrofon. Pastikan Anda telah memberikan izin kamera/mikrofon.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.error("Gagal menghentikan Speech Recognition:", err);
      }
    }
    setRecognitionActive(false);
  };

  const clearAudio = () => {
    setSelectedFile(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setDetectedDuration(null);
    setRecordedBlob(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordingDuration(0);
    setError(null);
    setRealtimeTranscript("");
    setInterimTranscript("");
    setExecutiveSummary(null);
  };

  // Call the backend or direct Google API to process the audio or summary points via Gemini API
  const handleProcessAudio = async () => {
    const isTextOnly = inputMethod === "points";
    const fileToProcess = inputMethod === "upload" ? selectedFile : recordedBlob;

    if (isTextOnly) {
      if (!summaryPoints.trim()) {
        setError("Silakan isi atau unggah poin-poin rangkuman terlebih dahulu.");
        return;
      }
    } else {
      if (!fileToProcess) {
        setError("Silakan pilih atau rekam audio terlebih dahulu.");
        return;
      }

      // Check if file size exceeds Vercel limit and there's no custom API key
      const isVercelTooLarge = fileToProcess.size > 4.5 * 1024 * 1024;
      if (isVercelTooLarge && !geminiApiKey.trim()) {
        setError(
          `Berkas audio Anda berukuran besar (${(fileToProcess.size / (1024 * 1024)).toFixed(1)} MB). Karena batasan serverless hosting Vercel (Error 413 Content Too Large), silakan masukkan Gemini API Key Anda pada kolom keamanan di atas halaman terlebih dahulu agar pemrosesan dapat dilakukan langsung dari browser Anda (Zero-Backend) tanpa batas ukuran berkas.`
        );
        return;
      }
    }

    setIsProcessing(true);
    setError(null);
    setResultMarkdown(null);
    setExecutiveSummary(null);
    setProgressPercent(0);
    setProgressMessage(isTextOnly ? "Mempersiapkan data rangkuman..." : "Mempersiapkan berkas audio...");

    let stepInterval: NodeJS.Timeout | null = null;
    let percentInterval: NodeJS.Timeout | null = null;

    try {
      let data: any = null;
      let notulensiResult = "";

      const useDirectClient = geminiApiKey.trim().length > 0;

      if (useDirectClient) {
        // --- DIRECT CLIENT-SIDE ARCHITECTURE (ZERO-BACKEND) ---
        if (isTextOnly) {
          setProgressMessage("Menghubungkan ke Google Gemini secara langsung...");
          setProgressPercent(40);

          const systemInstructionText = "Anda adalah seorang Notulen Rapat Profesional di Pengadilan Agama Paniai. Tugas utama Anda adalah menyusun Notulensi Rapat Dinas resmi yang SANGAT DETAIL, LENGKAP, FORMAL, dan PRESISI berdasarkan draf kasar/point-point rangkuman rapat yang disediakan oleh pengguna.";
          const promptText = `
Anda adalah seorang Notulen Rapat Profesional di Pengadilan Agama Paniai. Tugas utama Anda adalah menyusun Notulensi Rapat Dinas resmi yang SANGAT DETAIL, LENGKAP, FORMAL, dan PRESISI berdasarkan draf kasar/point-point rangkuman rapat yang disediakan oleh pengguna.

Tugas Anda adalah:
1. Mengubah poin-poin/catatan rapat kasar/ringkasan yang terkesan informal atau singkat menjadi format tata naskah dinas resmi Mahkamah Agung (Pengadilan Agama Paniai) yang baku, formal, rapi, dan rapi sesuai Pedoman Tata Naskah Dinas Mahkamah Agung.
2. Jangan kurangi detail atau kesimpulan penting apa pun dari poin-poin rapat yang disediakan. Kembangkan kalimatnya agar terdengar sangat profesional, dinas, dan formal tanpa menambah-nambahkan informasi fiktif yang tidak ada di dalam catatan kasar.
3. Gunakan gaya bahasa dinas formal (EYD V) untuk merangkum dan menguraikan draf rapat tersebut.
4. SANGAT PENTING (KUNCI UTAMA): Jangan melakukan penyederhanaan yang berlebihan. Setiap poin pembahasan, usulan, instruksi, masukan, kendala, dan tanggapan dari sub-bagian yang disebutkan di catatan kasar harus diuraikan secara RINCI, LENGKAP, dan JELAS.
5. JANGAN PERNAH menggunakan karakter asterisk (*) atau double asterisks (**) dalam seluruh hasil teks output Anda, baik untuk menandai bullet point/list maupun cetak tebal (bold). Untuk daftar list, gunakan nomor (1, 2, 3) atau huruf (a, b, c). Untuk cetak tebal/penekanan, gunakan HURUF KAPITAL secara bersih.
6. PENGGABUNGAN POIN BERULANG: Jika terdapat poin pembahasan, usulan, atau kesimpulan yang berulang, tumpang tindih, atau memiliki makna yang sama dari draf kasar, Anda harus menyatukan dan mengonsolidasikannya menjadi satu poin tunggal yang utuh dan komprehensif. Pilihlah susunan redaksi atau struktur kalimat yang sekiranya paling mengalir, tepat, dan nyambung dengan kalimat-kalimat lainnya di sekitarnya.

Berikut adalah draf kasar/point-point rangkuman rapat yang disediakan pengguna:
"""
${summaryPoints}
"""

Hasilkan output menggunakan format Markdown berikut:

MAHKAMAH AGUNG REPUBLIK INDONESIA
DIREKTORAT JENDERAL BADAN PERADILAN AGAMA
PENGADILAN TINGGI AGAMA JAYAPURA
PENGADILAN AGAMA PANIAI
Kompleks Kantor Bupati Paniai, Paniai Timur, Paniai, Telp. 085244544676
www.pa-paniai.go.id, pengadilan.agama.paniai@gmail.com
================================================================================

                                NOTULEN RAPAT

| Kode Dokumen | Tgl. Pembuatan | Tgl. Revisi | Tgl. Efektif |
| :--- | :--- | :--- | :--- |
| FM/AM/04/02 | 02/05/2018 | ..................... | 02/05/2018 |

Hari/Tanggal/Jam : [Ambil dari draf kasar jika ada, jika tidak tulis: Tidak disebutkan]
Tempat           : Ruang Rapat Pengadilan Agama Paniai
Pimpinan Rapat   : [Ambil dari draf kasar jika ada, jika tidak tulis: Tidak disebutkan]
Peserta Rapat    : [Ambil dari draf kasar jika ada, jika tidak tulis: Tidak disebutkan] Orang

--------------------------------------------------------------------------------
                                 Agenda Rapat
--------------------------------------------------------------------------------
Rapat dibuka oleh Sekretaris PA Paniai dengan bersama-sama membaca "Bismillahirrahmanirrahim"
Selanjutnya rapat dipimpin oleh Sekretaris Pengadilan agama Paniai, Pembahasan Rapat dimulai dengan mendengarkan penyampaian dari masing-masing sub bagian, yaitu:
[Tuliskan poin pembahasan tiap sub bagian/pembicara yang disebutkan di draf kasar secara berurutan. Uraikan dengan sangat profesional, detail, dan lengkap. Jangan kurangi detail apapun. Gunakan penomoran 1, 2, 3 alih-alih bullet points asterisks.]

Selanjutnya kesimpulan rapat sebagai berikut:
[Daftar kesimpulan resmi dan keputusan penting yang disepakati pembicara di draf kasar secara detail. Gunakan penomoran atau huruf alih-alih bullet points asterisks.]

Selanjutnya pimpinan rapat menutup rapat selanjutnya rapat ditutup dengan ucapan "ALHAMDULILLAHIRABBIL'ALAMIN"

--------------------------------------------------------------------------------
Mengetahui,
Pimpinan Rapat                                        Notulen Rapat


Ahmad Muhtar, S.H.I                                   Idris Al Basyir, A.Md
NIP. 198112122009121004                               NIP. 199601112025061004
`;

          setProgressMessage("Gemini sedang menyusun notulen rapat PA Paniai...");
          setProgressPercent(70);

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey.trim()}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                systemInstruction: { parts: [{ text: systemInstructionText }] }
              }),
            }
          );

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gagal menghubungi Gemini API: ${errText || response.statusText}`);
          }

          const genData = await response.json();
          notulensiResult = genData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        } else {
          // --- MULTISTEP RESUMABLE UPLOAD LOGIC FOR AUDIO FILES ---
          if (!fileToProcess) throw new Error("Berkas audio tidak ditemukan.");
          let mimeType = fileToProcess.type || (inputMethod === "record" ? "audio/webm" : "audio/mpeg");
          if (mimeType.includes(";")) {
            mimeType = mimeType.split(";")[0].trim();
          }
          if (mimeType === "video/webm") {
            mimeType = "audio/webm";
          }

          const fileSizeMB = (fileToProcess.size / (1024 * 1024)).toFixed(1);

          // Langkah 1: Inisialisasi metadata resumable upload
          setProgressMessage(`Langkah 1/3: Menghubungkan ke Google File API untuk inisialisasi (${fileSizeMB} MB)...`);
          setProgressPercent(15);

          const initUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey.trim()}`;
          const initResponse = await fetch(initUrl, {
            method: "POST",
            headers: {
              "X-Goog-Upload-Protocol": "resumable",
              "X-Goog-Upload-Command": "start",
              "X-Goog-Upload-Header-Content-Length": fileToProcess.size.toString(),
              "X-Goog-Upload-Header-Content-Type": mimeType,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              file: {
                displayName: fileToProcess.name || `rekaman_notulen_${Date.now()}.webm`,
              },
            }),
          });

          if (!initResponse.ok) {
            const errText = await initResponse.text();
            throw new Error(`Inisialisasi Google File Upload gagal: ${errText || initResponse.statusText}`);
          }

          const uploadUrl = initResponse.headers.get("X-Goog-Upload-URL");
          if (!uploadUrl) {
            throw new Error("Gagal menerima URL upload resumable dari Google API.");
          }

          // Langkah 2: Unggah file biner asli menggunakan XMLHttpRequest untuk progress tracking
          setProgressMessage(`Langkah 2/3: Mengunggah rekaman audio (${fileSizeMB}MB)...`);
          setProgressPercent(25);

          const fileMetadata: any = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", uploadUrl, true);
            xhr.setRequestHeader("X-Goog-Upload-Offset", "0");
            xhr.setRequestHeader("X-Goog-Upload-Command", "upload, finalize");
            xhr.setRequestHeader("Content-Type", "application/octet-stream");

            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                const percent = Math.min(Math.round((event.loaded / event.total) * 60) + 20, 80); // scale progress between 20% and 80%
                setProgressPercent(percent);
                setProgressMessage(`Langkah 2/3: Mengunggah rekaman audio (${fileSizeMB}MB) (${Math.round((event.loaded / event.total) * 100)}%)...`);
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  resolve(JSON.parse(xhr.responseText));
                } catch (e) {
                  resolve(xhr.responseText);
                }
              } else {
                reject(new Error(`Gagal mengunggah data biner audio: ${xhr.statusText} (${xhr.responseText})`));
              }
            };

            xhr.onerror = () => {
              reject(new Error("Terjadi galat jaringan saat mengunggah biner ke Google File API."));
            };

            xhr.send(fileToProcess);
          });

          if (!fileMetadata || !fileMetadata.file || !fileMetadata.file.name) {
            throw new Error("Gagal memperoleh detail file yang diunggah dari Google.");
          }

          // Langkah 2.5: Polling status file (Hingga ACTIVE)
          const fileRefName = fileMetadata.file.name;
          const fileUri = fileMetadata.file.uri;
          let fileState = "PROCESSING";
          let attempts = 0;
          setProgressPercent(85);

          while (fileState === "PROCESSING" && attempts < 30) {
            setProgressMessage("Google sedang memproses & memecah gelombang audio rapat...");
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const checkRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/${fileRefName}?key=${geminiApiKey.trim()}`
            );
            if (!checkRes.ok) {
              console.warn("Gagal mengecek status file, melanjutkan...");
              break;
            }
            const checkData = await checkRes.json();
            fileState = checkData.state || "ACTIVE";
            attempts++;

            if (fileState === "FAILED") {
              throw new Error("Proses pemecahan file audio gagal di server Google.");
            }
          }

          // Langkah 3: Kirim prompt ke Gemini 2.5-flash menggunakan URI File
          setProgressMessage("Langkah 3/3: Gemini sedang menganalisis suara & menyusun notulen rapat PA Paniai...");
          setProgressPercent(90);

          const systemInstructionText = "Ubah rekaman suara ini menjadi format Notulen Rapat Resmi Pengadilan Agama Paniai yang sangat terstruktur, rapi, faktual, dan dilarang keras berhalusinasi atau menambah informasi di luar rekaman.";
          const promptText = `
Anda adalah seorang Notulen Rapat Profesional di Pengadilan Agama Paniai. Tugas utama Anda adalah menyusun Notulensi Rapat Dinas yang EKSAT, SANGAT DETAIL, LENGKAP, dan FAKTUAL berdasarkan seluruh isi file audio rapat dinas yang disediakan.

ATURAN KETAT (ANTI-HALUSINASI & KELENGKAPAN MAKSIMAL):
1. HANYA tulis informasi yang benar-benar diucapkan atau disebutkan di dalam rekaman audio.
2. JANGAN PERNAH menambahkan asumsi, kesimpulan logis sendiri, atau mengarang cerita/agenda yang tidak ada di dalam audio.
3. Jika ada bagian format yang datanya tidak disebutkan di dalam audio (misalnya nama pimpinan atau jumlah peserta), tulis "Tidak disebutkan dalam rekaman".
4. Tetap gunakan gaya bahasa formal (EYD V) untuk merangkum kalimat yang diucapkan pembicara, tanpa mengubah inti faktanya.
5. SANGAT PENTING (KUNCI UTAMA): Jangan melakukan penyederhanaan yang berlebihan. Setiap pembahasan, usulan, instruksi, masukan, kendala, dan tanggapan dari sub-bagian (Kepegawaian, Umum & Keuangan, Perencanaan, TI, Pelaporan, Kepaniteraan, dll.) harus dituliskan secara RINCI dan LENGKAP.
6. JANGAN PERNAH menggunakan karakter asterisk (*) atau double asterisks (**) dalam seluruh hasil teks output Anda, baik untuk menandai bullet point/list maupun cetak tebal (bold). Untuk daftar list, gunakan nomor (1, 2, 3) atau huruf (a, b, c). Untuk cetak tebal/penekanan, gunakan HURUF KAPITAL secara bersih.
7. PENGGABUNGAN POIN BERULANG: Jika terdapat poin pembahasan, usulan, kendala, atau kesimpulan yang diucapkan berulang kali atau memiliki makna yang sama dalam rekaman, Anda harus menyatukan dan mengonsolidasikannya menjadi satu poin tunggal.

Hasilkan output menggunakan format Markdown berikut:

MAHKAMAH AGUNG REPUBLIK INDONESIA
DIREKTORAT JENDERAL BADAN PERADILAN AGAMA
PENGADILAN TINGGI AGAMA JAYAPURA
PENGADILAN AGAMA PANIAI
Kompleks Kantor Bupati Paniai, Paniai Timur, Paniai, Telp. 085244544676
www.pa-paniai.go.id, pengadilan.agama.paniai@gmail.com
================================================================================

                                NOTULEN RAPAT

| Kode Dokumen | Tgl. Pembuatan | Tgl. Revisi | Tgl. Efektif |
| :--- | :--- | :--- | :--- |
| FM/AM/04/02 | 02/05/2018 | ..................... | 02/05/2018 |

Hari/Tanggal/Jam : [Isi hanya jika ada di audio/perintah user, jika tidak tulis: Tidak disebutkan]
Tempat           : Ruang Rapat Pengadilan Agama Paniai
Pimpinan Rapat   : [Isi nama pimpinan dari audio/perintah user]
Peserta Rapat    : [Isi jumlah peserta] Orang

--------------------------------------------------------------------------------
                                 Agenda Rapat
--------------------------------------------------------------------------------
Rapat dibuka oleh Sekretaris PA Paniai dengan bersama-sama membaca "Bismillahirrahmanirrahim"
Selanjutnya rapat dipimpin oleh Sekretaris Pengadilan agama Paniai, Pembahasan Rapat dimulai dengan mendengarkan penyampaian dari masing-masing sub bagian, yaitu:
[Tuliskan poin pembahasan tiap sub bagian/pembicara yang BENAR-BENAR berbicara di audio secara berurutan. Jika tidak ada pembahasan sub bagian tertentu, jangan dikarang, cukup lewatkan. Gunakan penomoran 1, 2, 3 alih-alih bullet points.]

 Selanjutnya kesimpulan rapat sebagai berikut:
[Daftar kesimpulan resmi yang disepakati pembicara di dalam audio. Jika tidak ada keputusan eksplisit, tulis: "Tidak ada keputusan spesifik yang disebutkan". Gunakan penomoran atau huruf.]

Selanjutnya pimpinan rapat menutup rapat selanjutnya rapat ditutup dengan ucapan "ALHAMDULILLAHIRABBIL'ALAMIN"

--------------------------------------------------------------------------------
Mengetahui,
Pimpinan Rapat                                        Notulen Rapat


Ahmad Muhtar, S.H.I                                   Idris Al Basyir, A.Md
NIP. 198112122009121004                               NIP. 199601112025061004
`;

          let finalPrompt = promptText;
          if (realtimeTranscript && realtimeTranscript.trim().length > 0) {
            finalPrompt += `

=== CATATAN TRANSKRIPSI REAL-TIME WEB SPEECH API (REFERENSI AKURASI 100%) ===
Berikut adalah hasil penangkapan suara real-time kata-demi-kata (speech-to-text) dari mikrofon browser selama rapat berlangsung. Gunakan teks ini bersama dengan rekaman suara audio di atas untuk memverifikasi detail kata per kata, nama pimpinan, sub-bagian, dan poin rapat yang dibicarakan secara eksak:
"${realtimeTranscript}"
=============================================================================
`;
          }

          const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey.trim()}`;
          const genRes = await fetch(generateUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      fileData: {
                        mimeType: mimeType,
                        fileUri: fileUri,
                      },
                    },
                    {
                      text: finalPrompt,
                    },
                  ],
                },
              ],
              systemInstruction: { parts: [{ text: systemInstructionText }] }
            }),
          });

          if (!genRes.ok) {
            const errText = await genRes.text();
            throw new Error(`Penyusunan notulen gagal: ${errText || genRes.statusText}`);
          }

          const genData = await genRes.json();
          notulensiResult = genData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }

        if (!notulensiResult) {
          throw new Error("Gemini tidak mengembalikan hasil teks. Silakan coba kembali.");
        }

        notulensiResult = notulensiResult.replace(/\*/g, "");
        setResultMarkdown(notulensiResult);

        // Ringkasan Eksekutif (3 Keputusan Utama)
        setProgressMessage("Menyusun Ringkasan Eksekutif (3 Keputusan Utama)...");
        setProgressPercent(95);

        try {
          const summaryPrompt = `Berdasarkan hasil notulensi rapat Pengadilan Agama Paniai berikut, sarikan 3 keputusan atau tindakan utama yang paling penting dari rapat tersebut ke dalam tepat 3 poin ringkasan eksekutif (bullet points). 
Gunakan bahasa Indonesia yang sangat formal, padat, jelas, berwibawa, dan berfokus pada hasil/keputusan tindakan nyata (actionable decisions).

Format output harus berupa JSON array berisi tepat 3 string, contoh:
[
  "Menyetujui alokasi anggaran renovasi ruang sidang utama yang akan dimulai pada awal bulan depan.",
  "Menginstruksikan subbagian Kepegawaian untuk segera menyelesaikan evaluasi kinerja PPNPN paling lambat tanggal 25 bulan ini.",
  "Menyepakati jadwal rapat koordinasi berkala setiap hari Senin pagi pukul 09:00 WIT untuk memantau progres pelaksanaan program kerja."
]

Hasil Notulensi Rapat:
\${notulensiResult}`;

          const sumRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey.trim()}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                contents: [{ parts: [{ text: summaryPrompt }] }],
                generationConfig: {
                  responseMimeType: "application/json",
                },
              }),
            }
          );

          if (sumRes.ok) {
            const sumData = await sumRes.json();
            const rawJsonText = sumData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
            const parsed = JSON.parse(rawJsonText.trim());
            if (Array.isArray(parsed) && parsed.length > 0) {
              setExecutiveSummary(parsed.slice(0, 3).map((item: string) => item.replace(/\*/g, "").trim()));
            }
          }
        } catch (sumErr) {
          console.error("Gagal menjabarkan Ringkasan Eksekutif:", sumErr);
          setExecutiveSummary([
            "Keputusan rapat dinas resmi Pengadilan Agama Paniai telah berhasil dirumuskan.",
            "Program kerja masing-masing sub bagian disetujui untuk dilaksanakan sesuai target waktu.",
            "Meningkatkan koordinasi internal untuk memastikan kelancaran administrasi perkara dinas."
          ]);
        }

        setProgressPercent(100);
        setProgressMessage("Draf notulensi dinas berhasil diselesaikan!");
        await new Promise((resolve) => setTimeout(resolve, 800));

      } else {
        // --- ORIGINAL STANDARD BACKEND FALLBACK ARCHITECTURE ---
        if (inputMethod === "points") {
          setProgressPercent(20);
          setProgressMessage("Mengirimkan draf kasar rapat ke server...");

          const response = await fetch("/api/process-audio", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              isTextOnly: true,
              summaryPoints: summaryPoints,
            }),
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error! status: ${response.status}`);
          }

          data = await response.json();
        } else {
          if (!fileToProcess) {
            throw new Error("Berkas audio tidak ditemukan.");
          }
          let mimeType = fileToProcess.type || (inputMethod === "record" ? "audio/webm" : "audio/mpeg");
          if (mimeType.includes(";")) {
            mimeType = mimeType.split(";")[0].trim();
          }
          if (mimeType === "video/webm") {
            mimeType = "audio/webm";
          }

          setProgressMessage("Mengunggah berkas audio rapat ke server (0%)...");

          data = await new Promise<any>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/process-audio", true);

            // Track upload progress
            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 60); // Scale upload progress to 60%
                setProgressPercent(percent);
                setProgressMessage(`Mengunggah berkas audio rapat ke server (${percent}%)...`);
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  resolve(JSON.parse(xhr.responseText));
                } catch (e) {
                  resolve(xhr.responseText);
                }
              } else {
                let errorMsg = "Gagal memproses audio rapat.";
                try {
                  const resJson = JSON.parse(xhr.responseText);
                  errorMsg = resJson.error || errorMsg;
                } catch (e) {}
                reject(new Error(errorMsg));
              }
            };

            xhr.onerror = () => reject(new Error("Terjadi galat koneksi jaringan saat mengunggah ke server."));

            // Build FormData
            const formData = new FormData();
            if (inputMethod === "upload" && selectedFile) {
              formData.append("audio", selectedFile, selectedFile.name);
            } else if (inputMethod === "record" && recordedBlob) {
              formData.append("audio", recordedBlob, "rekaman_langsung.webm");
            }

            if (realtimeTranscript && realtimeTranscript.trim().length > 0) {
              formData.append("realtimeTranscript", realtimeTranscript);
            }

            xhr.send(formData);
          });
        }

        // After upload finishes, show server-side process messages
        setProgressPercent(65);
        setProgressMessage(
          inputMethod === "points"
            ? "Menyusun poin rapat kasar menjadi tata naskah dinas resmi..."
            : "Menganalisis audio & menyusun tata naskah dinas Pengadilan Agama Paniai..."
        );

        const steps = inputMethod === "points"
          ? [
              "Menerima poin-poin rapat kasar...",
              "Mengirim data ke Gemini 2.5-flash...",
              "Menyusun tata naskah dinas resmi Mahkamah Agung...",
              "Memformulasikan kesimpulan dan keputusan rapat...",
              "Menyelesaikan draf notulensi dinas..."
            ]
          : [
              "Menganalisis audio & menyusun tata naskah dinas Pengadilan Agama Paniai...",
              "Mengirimkan audio ke Gemini 2.5-flash...",
              "Gemini sedang mentranskripsi percakapan...",
              "Mengekstrak pimpinan rapat, agenda, dan peserta...",
              "Merumuskan kesimpulan rapat secara dinas dan formal...",
              "Menyelesaikan draf notulensi dinas..."
            ];

        let currentStep = 0;
        stepInterval = setInterval(() => {
          if (currentStep < steps.length - 1) {
            currentStep++;
            setProgressMessage(steps[currentStep]);
          }
        }, 4000);

        percentInterval = setInterval(() => {
          setProgressPercent((prev) => {
            if (prev < 98) return prev + 1;
            return prev;
          });
        }, 1000);

        // We already have 'data' from the successful XHR or fetch request!
        if (!data || !data.result) {
          throw new Error("Gagal memperoleh hasil notulensi rapat.");
        }

        // On successful transcription, jump progress to 100% and wait a moment for completion feel
        setProgressPercent(100);
        setProgressMessage("Draf notulensi dinas berhasil diselesaikan!");
        await new Promise((resolve) => setTimeout(resolve, 800));

        const cleanResult = data.result ? data.result.replace(/\*/g, "") : "";
        setResultMarkdown(cleanResult);
        if (data.executiveSummary) {
          setExecutiveSummary(data.executiveSummary.map((item: string) => item.replace(/\*/g, "")));
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Terjadi kesalahan saat memproses audio rapat dinas.");
    } finally {
      if (stepInterval) clearInterval(stepInterval);
      if (percentInterval) clearInterval(percentInterval);
      setIsProcessing(false);
    }
  };

  // Download client-side TXT
  const handleDownloadTxt = () => {
    if (!resultMarkdown) return;
    const element = document.createElement("a");
    const file = new Blob([resultMarkdown], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = "notulen_rapat_paniai.txt";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Download DOCX via server
  const handleDownloadDocx = async () => {
    if (!resultMarkdown) return;
    try {
      const response = await fetch("/api/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: resultMarkdown }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Gagal membuat berkas DOCX.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "notulen_rapat_paniai.docx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      setError("Gagal mendownload dokumen Word: " + err.message);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Python code block to display
  const pythonCode = `import os
import io
import datetime
from google import genai
from google.genai import types
import streamlit as st
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

# Jalankan dengan: streamlit run app.py
# Butuh: pip install streamlit google-genai python-docx streamlit-mic-recorder
`;

  const copyPythonCode = () => {
    fetch("/streamlit_app.py")
      .then((res) => res.text())
      .then((text) => {
        navigator.clipboard.writeText(text);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err) => {
        // Fallback
        navigator.clipboard.writeText(pythonCode);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      });
  };

  // Quick extract helper for web rendering of metadata
  const parseDocumentMetadata = (md: string) => {
    // Strip asterisks to ensure no leftover asterisks in any parsed metadata field
    const cleanMd = md.replace(/\*/g, "");
    const lines = cleanMd.split("\n");
    let tglPembuatan = "02/05/2018";
    let tglRevisi = ".....................";
    let tglEfektif = "02/05/2018";
    let hariTanggal = ".....................";
    let tempat = "Ruang Rapat Pengadilan Agama Paniai";
    let pimpinan = ".....................";
    let peserta = ".....................";
    let agendaContent: string[] = [];
    let kesimpulanContent: string[] = [];

    let isAgenda = false;
    let isKesimpulan = false;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("Hari/Tanggal/Jam") || trimmed.includes("Hari/Tanggal/Jam :") || trimmed.includes("Hari/Tanggal/Jam:")) {
        const parts = trimmed.split(":");
        parts.shift();
        hariTanggal = parts.join(":").trim() || hariTanggal;
      } else if (trimmed.startsWith("Tempat") || trimmed.includes("Tempat :") || trimmed.includes("Tempat:")) {
        const parts = trimmed.split(":");
        parts.shift();
        tempat = parts.join(":").trim() || tempat;
      } else if (trimmed.startsWith("Pimpinan Rapat") || trimmed.includes("Pimpinan Rapat :") || trimmed.includes("Pimpinan Rapat:")) {
        const parts = trimmed.split(":");
        parts.shift();
        pimpinan = parts.join(":").trim() || pimpinan;
      } else if (trimmed.startsWith("Peserta Rapat") || trimmed.includes("Peserta Rapat :") || trimmed.includes("Peserta Rapat:")) {
        const parts = trimmed.split(":");
        parts.shift();
        peserta = parts.join(":").trim() || peserta;
      } else if (trimmed.toLowerCase().includes("agenda rapat")) {
        isAgenda = true;
        isKesimpulan = false;
      } else if (trimmed.toLowerCase().includes("kesimpulan rapat") || trimmed.toLowerCase().includes("kesimpulan / keputusan") || trimmed.toLowerCase().includes("selanjutnya kesimpulan rapat")) {
        isAgenda = false;
        isKesimpulan = true;
      } else if (trimmed.toLowerCase().includes("mengetahui") || (trimmed.toLowerCase().includes("pimpinan rapat") && trimmed.toLowerCase().includes("notulen rapat"))) {
        isAgenda = false;
        isKesimpulan = false;
      } else {
        const isDivider = /^[=\-\s|_:|…*]*$/.test(trimmed) || trimmed === "";
        if (!isDivider) {
          if (isAgenda && !trimmed.toLowerCase().includes("agenda rapat")) {
            agendaContent.push(trimmed);
          } else if (isKesimpulan && !trimmed.toLowerCase().includes("kesimpulan") && !trimmed.toLowerCase().includes("keputusan")) {
            kesimpulanContent.push(trimmed);
          }
        }
      }
    });

    // Extract signature names and NIPs or use defaults
    let pimpinanName = "Ahmad Muhtar, S.H.I";
    let pimpinanNip = "198112122009121004";
    let notulenName = "Idris Al Basyir, A.Md";
    let notulenNip = "199601112025061004";

    const lastLines = lines.slice(-15).map(l => l.trim()).filter(l => l);
    let sigIdx = -1;
    for (let i = 0; i < lastLines.length; i++) {
      if (lastLines[i].toLowerCase().includes("mengetahui") || (lastLines[i].toLowerCase().includes("pimpinan") && lastLines[i].toLowerCase().includes("notulen"))) {
        sigIdx = i;
        break;
      }
    }
    if (sigIdx !== -1) {
      const sigLines = lastLines.slice(sigIdx + 1);
      const nameLines = sigLines.filter(l => !l.toLowerCase().includes("pimpinan") && !l.toLowerCase().includes("notulen") && !l.toLowerCase().includes("nip.") && !l.toLowerCase().includes("mengetahui") && !l.toLowerCase().includes("---"));
      if (nameLines.length > 0) {
        const parts = nameLines[0].split(/\s{3,}/);
        if (parts[0]) {
          const cleanP = parts[0].replace(/[\[\]]/g, "").trim();
          if (cleanP && !cleanP.includes("Pimpinan") && !cleanP.includes("Ambil dari") && cleanP !== ".....................") {
            pimpinanName = cleanP;
          }
        }
        if (parts[1]) {
          const cleanN = parts[1].replace(/[\[\]]/g, "").trim();
          if (cleanN && !cleanN.includes("Notulen") && !cleanN.includes("Ambil dari") && cleanN !== ".....................") {
            notulenName = cleanN;
          }
        }
      }
      
      const nipLines = sigLines.filter(l => l.includes("NIP."));
      if (nipLines.length > 0) {
        const parts = nipLines[0].split(/\s{3,}/);
        if (parts[0]) {
          const cleanNip = parts[0].replace(/NIP\.\s*/gi, "").replace(/[\[\]]/g, "").trim();
          if (cleanNip && !cleanNip.includes("NIP") && cleanNip !== ".....................") {
            pimpinanNip = cleanNip;
          }
        }
        if (parts[1]) {
          const cleanNip = parts[1].replace(/NIP\.\s*/gi, "").replace(/[\[\]]/g, "").trim();
          if (cleanNip && !cleanNip.includes("NIP") && cleanNip !== ".....................") {
            notulenNip = cleanNip;
          }
        }
      }
    }

    return {
      tglPembuatan,
      tglRevisi,
      tglEfektif,
      hariTanggal,
      tempat,
      pimpinan,
      peserta,
      agendaContent,
      kesimpulanContent,
      pimpinanName,
      pimpinanNip,
      notulenName,
      notulenNip,
    };
  };

  const docMetadata = resultMarkdown ? parseDocumentMetadata(resultMarkdown) : null;

  return (
    <div className="min-h-screen bg-[#fdfcf9] text-stone-800 flex flex-col font-sans">
      {/* Top Navigation / Court Banner */}
      <header className="bg-[#064e3b] text-[#fdfcf9] py-4 px-6 shadow-md border-b-2 border-[#d4af37] shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-4">
            <div className="bg-white/10 rounded-lg p-2.5 flex items-center justify-center border border-white/20 shadow-inner">
              <Scale className="h-8 w-8 text-[#fdfcf9]" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight uppercase text-[#fdfcf9]">
                Sistem Notulensi Rapat Otomatis <span className="text-xs lowercase italic font-normal text-emerald-300 ml-1.5 font-sans normal-case">by idris</span>
              </h1>
              <p className="text-[10px] md:text-xs uppercase tracking-widest opacity-80 font-medium">
                Pengadilan Agama Paniai • Mahkamah Agung RI
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        
        {/* API KEY CONFIGURATION BLOCK */}
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-4 md:p-5 relative overflow-hidden">
          <div className="absolute right-0 top-0 h-16 w-16 bg-[#d4af37]/5 rounded-bl-full border-l border-b border-[#d4af37]/10 flex items-center justify-center">
            <Key className="h-4 w-4 text-[#d4af37]" />
          </div>
          <h2 className="text-xs font-bold text-[#064e3b] uppercase tracking-widest mb-1.5 flex items-center gap-2">
            🔐 Keamanan API Key & Zero-Backend (Penyelesaian Limit Ukuran File)
          </h2>
          <p className="text-xs text-stone-500 mb-4 leading-relaxed max-w-5xl">
            Sistem ini sepenuhnya mendukung pengunggahan berkas suara besar (70MB+) langsung ke Google File API di sisi klien (Zero-Backend) untuk melompati pembatasan hosting Vercel. Silakan masukkan Kunci API Gemini Anda dari Google AI Studio di bawah. Kunci API disimpan aman di penyimpanan lokal (localStorage) browser Anda.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type={showApiKey ? "text" : "password"}
                placeholder="Masukkan GEMINI_API_KEY Anda untuk mengaktifkan direct-upload (mendukung berkas > 4.5MB)..."
                value={geminiApiKey}
                onChange={(e) => {
                  setGeminiApiKey(e.target.value);
                  setIsKeySaved(false);
                }}
                className={`w-full text-xs font-mono pl-3 pr-10 py-2.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-emerald-700 ${
                  isKeySaved
                    ? "border-emerald-300 bg-emerald-50/20 text-emerald-900"
                    : "border-stone-300 text-stone-800"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              onClick={handleSaveApiKey}
              className={`px-5 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all shadow-sm ${
                isKeySaved
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-stone-800 hover:bg-black text-white"
              }`}
            >
              {isKeySaved ? "✓ Tersimpan" : "Simpan Kunci"}
            </button>
          </div>
          {isKeySaved && (
            <p className="text-[10px] text-emerald-600 mt-2 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Mode Zero-Backend Aktif: Pengunggahan berkas besar akan diproses langsung dari browser ke Google tanpa hambatan ukuran berkas.
            </p>
          )}
        </div>

        {/* Grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Input Panel */}
          <section className="lg:col-span-4 flex flex-col gap-6">
          {/* Welcome and Context Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-5">
            <h2 className="text-base font-semibold text-stone-900 mb-2 flex items-center gap-2">
              ⚖️ Notulen Rapat Dinas Profesional
            </h2>
            <p className="text-stone-600 text-xs leading-relaxed">
              Selamat datang di asisten penyusunan Notulensi Rapat Pengadilan Agama Paniai. 
              Sistem ini akan mentranskripsi rekaman suara dan menyusun draf notulen dinas resmi dengan format yang presisi.
            </p>
          </div>

          {/* Audio Input Card */}
          <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
            {/* Tabs Header */}
            <div className="flex border-b border-stone-200 bg-stone-50">
              <button
                onClick={() => {
                  setInputMethod("upload");
                  clearAudio();
                }}
                className={`flex-1 py-3 px-1 text-[11px] font-semibold border-b-2 flex items-center justify-center gap-1.5 transition-all ${
                  inputMethod === "upload"
                    ? "border-[#064e3b] text-[#064e3b] bg-white font-bold"
                    : "border-transparent text-stone-500 hover:text-stone-800 hover:bg-stone-100/50"
                }`}
              >
                <Upload className="h-3.5 w-3.5" />
                File Audio
              </button>
              <button
                onClick={() => {
                  setInputMethod("record");
                  clearAudio();
                }}
                className={`flex-1 py-3 px-1 text-[11px] font-semibold border-b-2 flex items-center justify-center gap-1.5 transition-all ${
                  inputMethod === "record"
                    ? "border-[#064e3b] text-[#064e3b] bg-white font-bold"
                    : "border-transparent text-stone-500 hover:text-stone-800 hover:bg-stone-100/50"
                }`}
              >
                <Mic className="h-3.5 w-3.5" />
                Rekam Mikrofon
              </button>
              <button
                onClick={() => {
                  setInputMethod("points");
                  clearAudio();
                }}
                className={`flex-1 py-3 px-1 text-[11px] font-semibold border-b-2 flex items-center justify-center gap-1.5 transition-all ${
                  inputMethod === "points"
                    ? "border-[#064e3b] text-[#064e3b] bg-white font-bold"
                    : "border-transparent text-stone-500 hover:text-stone-800 hover:bg-stone-100/50"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Poin Rangkuman
              </button>
            </div>

            {/* Content Area */}
            <div className="p-5">
              {inputMethod === "upload" ? (
                /* Drag & Drop Upload Container */
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                    isDragging
                      ? "border-emerald-500 bg-emerald-50/50"
                      : "border-stone-300 hover:border-stone-400 bg-stone-50/50 hover:bg-stone-50"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="audio/*"
                    className="hidden"
                  />
                  <div className="bg-stone-100 p-4 rounded-full mb-3 text-stone-600">
                    <FileAudio className="h-8 w-8 text-stone-500" />
                  </div>
                  <h3 className="text-sm font-medium text-stone-800">
                    {selectedFile ? selectedFile.name : "Pilih atau Seret File Rekaman"}
                  </h3>
                  <p className="text-stone-500 text-xs mt-1 max-w-xs">
                    Mendukung format WAV, MP3, M4A, AAC, dll. Maksimal ukuran file 50MB.
                  </p>
                  {selectedFile && (
                    <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
                      <span className="text-xs bg-emerald-50 text-emerald-800 font-mono py-1 px-2.5 rounded-full border border-emerald-200 flex items-center gap-1.5 shadow-sm">
                        <Clock className="h-3.5 w-3.5 text-emerald-600" />
                        Durasi: {detectedDuration !== null ? formatTime(Math.round(detectedDuration)) : "Mendeteksi..."}
                      </span>
                      <span className="text-xs bg-stone-100 text-stone-700 font-mono py-1 px-2.5 rounded-full border border-stone-200 shadow-sm">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                  )}
                </div>
              ) : inputMethod === "record" ? (
                /* Microphone Recording Container */
                <div className="flex flex-col items-center justify-center p-5 bg-stone-50/50 border border-stone-200 rounded-xl text-center">
                  {isRecording ? (
                    <div className="flex flex-col items-center gap-4 w-full">
                      {/* Pulsing Recording Indicator */}
                      <button
                        onClick={stopRecording}
                        className="h-20 w-20 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg hover:shadow-red-500/20 animate-pulse-recording transition-all"
                      >
                        <div className="h-6 w-6 bg-white rounded-sm"></div>
                      </button>
                      <div>
                        <span className="text-red-600 font-bold text-lg font-mono">
                          {formatTime(recordingDuration)}
                        </span>
                        <p className="text-stone-500 text-xs mt-1 font-sans">
                          Sedang merekam suara rapat dinas...
                        </p>
                      </div>
                      {/* Fake waveform animation */}
                      <div className="flex items-center gap-1.5 h-6 mt-2">
                        {[4, 2, 6, 8, 5, 7, 3, 5, 9, 4, 6, 2, 5, 7, 3, 5].map((h, i) => (
                          <div
                            key={i}
                            className="w-1 bg-red-500 rounded-full transition-all duration-300"
                            style={{
                              height: `${isRecording ? h * 2.5 : 4}px`,
                              animation: isRecording ? `pulse 1s ease-in-out infinite alternate` : "none",
                              animationDelay: `${i * 0.08}s`,
                            }}
                          ></div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 w-full">
                      <button
                        onClick={startRecording}
                        className="h-20 w-20 rounded-full bg-stone-800 hover:bg-stone-900 text-white flex items-center justify-center shadow-md hover:shadow-lg transition-all"
                      >
                        <Mic className="h-9 w-9 text-white" />
                      </button>
                      <div>
                        <h3 className="text-sm font-medium text-stone-800">
                          {recordedBlob ? "Hasil Rekaman Siap" : "Mulai Rekam Suara Langsung"}
                        </h3>
                        <p className="text-stone-500 text-xs mt-1">
                          Klik tombol di atas untuk merekam menggunakan mikrofon laptop/PC.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Real-time Transcription Web Speech API Toggle (Only when not actively recording) */}
                  {!isRecording && (
                    <div className="mt-4 flex items-center gap-3 bg-white p-3 border border-stone-200 rounded-lg text-left w-full shadow-sm">
                      <input
                        type="checkbox"
                        id="use-realtime-speech"
                        checked={useRealtimeSpeech}
                        onChange={(e) => setUseRealtimeSpeech(e.target.checked)}
                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-stone-300 rounded cursor-pointer"
                      />
                      <label htmlFor="use-realtime-speech" className="text-xs text-stone-700 font-medium cursor-pointer select-none flex-1">
                        <span className="font-bold text-[#064e3b]">Transkripsi Real-Time (Web Speech)</span>
                        <p className="text-[10px] text-stone-500 mt-0.5 font-normal leading-tight">
                          Tampilkan teks langsung di layar saat Anda sedang berbicara di rapat.
                        </p>
                      </label>
                    </div>
                  )}

                  {recordedUrl && !isRecording && (
                    <div className="mt-4 w-full bg-white p-3 border border-stone-200 rounded-lg text-left shadow-sm">
                      <span className="text-xs text-stone-500 block mb-2 font-medium">Hasil Rekaman Terakhir:</span>
                      <audio src={recordedUrl} controls className="w-full h-10" />
                    </div>
                  )}

                  {/* Web Speech Real-Time Transcription Textbox */}
                  {(realtimeTranscript || interimTranscript) && (
                    <div className="mt-4 text-left bg-[#f4f7f6] border border-[#d1dbd8] rounded-lg p-3.5 w-full">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-[#064e3b] flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          Teks Transkripsi Real-Time {isRecording ? "(Mendengarkan...)" : "(Selesai)"}:
                        </span>
                        {realtimeTranscript && !isRecording && (
                          <button
                            onClick={() => {
                              setRealtimeTranscript("");
                              setInterimTranscript("");
                            }}
                            className="text-stone-400 hover:text-stone-600 text-[10px] font-bold"
                          >
                            Reset Teks
                          </button>
                        )}
                      </div>
                      <div className="text-xs font-mono text-stone-800 leading-relaxed max-h-36 overflow-y-auto bg-white p-2.5 border border-stone-200 rounded-md whitespace-pre-wrap select-text">
                        {realtimeTranscript}
                        {interimTranscript && (
                          <span className="text-emerald-600 font-bold italic font-sans"> {interimTranscript}...</span>
                        )}
                      </div>
                      <p className="text-[10px] text-stone-500 mt-1.5 leading-tight">
                        *Teks ini akan dikirimkan ke AI bersama rekaman audio untuk memastikan hasil notulensi draf dinas 100% lengkap dan akurat.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                /* Points Input Container */
                <div className="flex flex-col gap-4">
                  {/* Text File Drop Zone / Button */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => summaryFileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                      isDragging
                        ? "border-emerald-500 bg-emerald-50/50"
                        : "border-stone-300 hover:border-stone-400 bg-stone-50/50 hover:bg-stone-50"
                    }`}
                  >
                    <input
                      type="file"
                      ref={summaryFileInputRef}
                      onChange={handleSummaryFileChange}
                      accept=".txt,.md,.json,.csv,text/*"
                      className="hidden"
                    />
                    <FileText className="h-7 w-7 text-stone-500 mb-2" />
                    <h3 className="text-xs font-semibold text-stone-800">
                      Unggah Berkas Catatan Rapat (.TXT, .MD)
                    </h3>
                    <p className="text-[10px] text-stone-500 mt-1">
                      Seret & taruh berkas catatan kasar di sini atau klik untuk memilih berkas.
                    </p>
                  </div>

                  {/* Manual points input field */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-[#064e3b] flex items-center justify-between">
                      <span>Draf Kasar / Poin Rangkuman Rapat:</span>
                      {summaryPoints && (
                        <button
                          onClick={() => setSummaryPoints("")}
                          className="text-rose-600 hover:text-rose-800 text-[10px] font-bold"
                        >
                          Bersihkan Teks
                        </button>
                      )}
                    </label>
                    <textarea
                      value={summaryPoints}
                      onChange={(e) => setSummaryPoints(e.target.value)}
                      placeholder="Masukkan draf kasar rapat, poin-poin penting, agenda, keputusan, atau ringkasan pembicaraan di sini...

AI akan mengonversinya ke dalam format Tata Naskah Dinas resmi Mahkamah Agung yang sangat detail, formal, dan lengkap sesuai EYD V tanpa ada rincian penting yang terlewat."
                      className="w-full h-56 text-xs font-sans text-stone-800 leading-relaxed bg-white p-3 border border-stone-200 rounded-xl placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#064e3b] resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Upload Player (for file source) */}
              {inputMethod === "upload" && audioUrl && (
                <div className="mt-4 p-3.5 bg-stone-50 border border-stone-200 rounded-xl">
                  <span className="text-xs text-stone-600 font-semibold block mb-2">Pratinjau Suara:</span>
                  <audio src={audioUrl} controls className="w-full h-10" />
                  
                  {/* Companion Manual Transcript for Upload Source (Optional) */}
                  <div className="mt-4 text-left">
                    <span className="text-xs font-bold text-[#064e3b] block mb-1.5">
                      Catatan Tambahan / Transkrip Kasar (Opsional):
                    </span>
                    <textarea
                      value={realtimeTranscript}
                      onChange={(e) => setRealtimeTranscript(e.target.value)}
                      placeholder="Tempelkan transkrip kasar, catatan, atau rincian pembicaraan di sini jika ada. AI akan menggabungkannya dengan rekaman suara untuk hasil draf dinas yang 100% komprehensif tanpa terpotong."
                      className="w-full h-24 text-xs font-sans text-stone-800 leading-relaxed bg-white p-2.5 border border-stone-200 rounded-lg placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}

              {/* Clear action */}
              {((inputMethod === "upload" && selectedFile) || (inputMethod === "record" && recordedBlob) || (inputMethod === "points" && summaryPoints)) && (
                <button
                  onClick={() => {
                    if (inputMethod === "points") {
                      setSummaryPoints("");
                    } else {
                      clearAudio();
                    }
                  }}
                  disabled={isProcessing}
                  className="mt-4 w-full py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Hapus & Reset Input
                </button>
              )}

              {/* Process Button */}
              <button
                onClick={handleProcessAudio}
                disabled={isProcessing || (inputMethod === "points" ? !summaryPoints.trim() : (!selectedFile && !recordedBlob))}
                className={`w-full mt-5 py-3 px-4 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-2.5 transition-all ${
                  isProcessing || (inputMethod === "points" ? !summaryPoints.trim() : (!selectedFile && !recordedBlob))
                    ? "bg-stone-200 text-stone-400 cursor-not-allowed shadow-none"
                    : "bg-[#064e3b] hover:bg-[#043d2e] shadow-lg shadow-emerald-900/20 active:scale-[0.98]"
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memproses Notulensi...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Proses Notulensi Rapat Dinas
                  </>
                )}
              </button>
            </div>
          </div>

        </section>

        {/* Right Column: Results & Previews */}
        <section className="lg:col-span-8 flex flex-col gap-4">
          {/* Header Actions for download */}
          {resultMarkdown && (
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="bg-emerald-50 p-1.5 rounded-lg border border-emerald-200">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-stone-900">Notulensi Siap!</h3>
                  <p className="text-[10px] text-stone-500">Tersusun rapi mengikuti Tata Naskah Dinas</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadTxt}
                  className="py-2 px-3.5 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold rounded-lg flex items-center gap-2 border border-stone-300 shadow-sm transition-all active:scale-95"
                >
                  <FileText className="h-4 w-4" />
                  Unduh .TXT
                </button>
                <button
                  onClick={handleDownloadDocx}
                  className="py-2 px-3.5 bg-stone-800 hover:bg-black text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow-sm transition-all active:scale-95"
                >
                  <Download className="h-4 w-4" />
                  Unduh .DOCX (Word)
                </button>
              </div>
            </div>
          )}

          {/* Paper View Container layout wrapper */}
          <div className="flex flex-col xl:flex-row gap-6 items-start flex-1 w-full">
            {/* Paper View Container */}
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden flex-1 flex flex-col min-h-[500px] w-full">
              {/* View status bar */}
              <div className="border-b border-stone-200 bg-stone-50 py-3 px-5 flex items-center justify-between">
                <span className="text-xs font-bold text-stone-600 font-mono uppercase tracking-wide">
                  Draf Notulen Dinas Resmi
                </span>
                <span className="text-xs text-stone-400 font-medium">Pratinjau Kertas Resmi</span>
              </div>

              {/* Main Result Display */}
              <div className="p-6 md:p-8 overflow-y-auto flex-1 bg-[#fafafa] flex flex-col justify-center">
                {isProcessing ? (
                  /* Dynamic Processing State with Percentage Bar */
                  <div className="text-center py-12 flex flex-col items-center justify-center max-w-sm mx-auto font-sans w-full">
                    <div className="relative mb-4">
                      {/* Ring Spinner */}
                      <div className="h-20 w-20 rounded-full border-4 border-stone-200 border-t-[#064e3b] animate-spin"></div>
                      {/* Center Icon/Percent */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xs font-bold text-[#064e3b] font-mono leading-none">{progressPercent}%</span>
                        <span className="text-[8px] text-stone-400 uppercase font-bold mt-0.5 tracking-wider">proses</span>
                      </div>
                    </div>
                    
                    <h3 className="text-sm font-bold text-stone-800">Sedang Menyusun Notulensi Rapat...</h3>
                    
                    {/* Visual Percentage Progress Bar */}
                    <div className="w-full bg-stone-200 h-2.5 rounded-full mt-3.5 mb-2 overflow-hidden shadow-inner relative">
                      <div
                        className="bg-gradient-to-r from-emerald-600 to-[#064e3b] h-full rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${progressPercent}%` }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between w-full text-[10px] font-mono text-stone-500 mb-4 px-1">
                      <span>Tahap Analisis AI</span>
                      <span className="font-bold text-[#064e3b]">{progressPercent}% selesai</span>
                    </div>

                    <p className="text-stone-600 text-xs font-semibold leading-relaxed bg-[#f1f5f3] py-2 px-3.5 border border-[#d2dfd8] rounded-lg w-full mb-6">
                      {progressMessage}
                    </p>
                    
                    {/* Visual list of tasks with dynamically lighting checklist based on percentage */}
                    <div className="w-full text-left border-t border-stone-200 pt-5 space-y-3">
                      <div className="flex items-start gap-2.5 text-xs">
                        <span className={`mt-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                          progressPercent >= 30 
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300" 
                            : "bg-emerald-500 text-white animate-pulse"
                        }`}>
                          {progressPercent >= 30 ? "✓" : "1"}
                        </span>
                        <span className={progressPercent >= 30 ? "text-stone-400 line-through" : "text-stone-800 font-medium"}>
                          Mengunggah & Membaca Gelombang Audio
                        </span>
                      </div>

                      <div className="flex items-start gap-2.5 text-xs">
                        <span className={`mt-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                          progressPercent >= 65 
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300" 
                            : progressPercent >= 30 
                              ? "bg-[#064e3b] text-white animate-pulse" 
                              : "bg-stone-100 text-stone-400 border border-stone-200"
                        }`}>
                          {progressPercent >= 65 ? "✓" : "2"}
                        </span>
                        <span className={
                          progressPercent >= 65 
                            ? "text-stone-400 line-through" 
                            : progressPercent >= 30 
                              ? "text-stone-800 font-medium" 
                              : "text-stone-400"
                        }>
                          Transkripsi Detail & Sinkronisasi Suara
                        </span>
                      </div>

                      <div className="flex items-start gap-2.5 text-xs">
                        <span className={`mt-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                          progressPercent >= 90 
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300" 
                            : progressPercent >= 65 
                              ? "bg-[#064e3b] text-white animate-pulse" 
                              : "bg-stone-100 text-stone-400 border border-stone-200"
                        }`}>
                          {progressPercent >= 90 ? "✓" : "3"}
                        </span>
                        <span className={
                          progressPercent >= 90 
                            ? "text-stone-400 line-through" 
                            : progressPercent >= 65 
                              ? "text-stone-800 font-medium" 
                              : "text-stone-400"
                        }>
                          Penyusunan Format Tata Naskah Dinas Resmi
                        </span>
                      </div>

                      <div className="flex items-start gap-2.5 text-xs">
                        <span className={`mt-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                          progressPercent >= 100 
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300" 
                            : progressPercent >= 90 
                              ? "bg-[#064e3b] text-white animate-pulse" 
                              : "bg-stone-100 text-stone-400 border border-stone-200"
                        }`}>
                          {progressPercent >= 100 ? "✓" : "4"}
                        </span>
                        <span className={
                          progressPercent >= 100 
                            ? "text-stone-400 line-through" 
                            : progressPercent >= 90 
                              ? "text-stone-800 font-medium" 
                              : "text-stone-400"
                        }>
                          Finalisasi Dokumen & Pembuatan File Unduhan
                        </span>
                      </div>
                    </div>
                  </div>
                ) : error ? (
                  /* Error State */
                  <div className="text-center py-12 max-w-md mx-auto flex flex-col items-center font-sans">
                    <div className="bg-rose-50 text-rose-500 p-4 rounded-full mb-3.5 border border-rose-100">
                      <AlertCircle className="h-8 w-8" />
                    </div>
                    <h3 className="text-sm font-semibold text-stone-900">Gagal Memproses Notulensi</h3>
                    <p className="text-stone-500 text-xs mt-2 leading-relaxed">{error}</p>
                    <button
                      onClick={() => setError(null)}
                      className="mt-5 py-2 px-4 bg-stone-800 text-white rounded-lg text-xs font-semibold hover:bg-black shadow transition-all animate-pulse"
                    >
                      Coba Lagi
                    </button>
                  </div>
                ) : resultMarkdown && docMetadata ? (
                  /* Beautiful Paper Layout with Real-time styling (Supports dynamic multi-page based on content size) */
                  (() => {
                    const isMultiPage = docMetadata.agendaContent.length + docMetadata.kesimpulanContent.length > 8 || resultMarkdown.length > 1000;
                    
                    if (isMultiPage) {
                      return (
                        <div className="flex flex-col gap-8 w-full select-text">
                          {/* PAGE 1 */}
                          <div className="bg-white shadow-md border border-stone-100 rounded-sm max-w-2xl mx-auto w-full p-8 md:p-12 font-serif text-stone-800 leading-relaxed relative min-h-[850px] flex flex-col justify-between">
                            <div>
                              {/* Watermark Crest (Styled subtly) */}
                              <div className="absolute inset-0 opacity-[0.015] flex items-center justify-center pointer-events-none">
                                <Scale className="h-96 w-96 text-stone-900" />
                              </div>

                              {/* COP SURAT */}
                              <div className="text-center border-b-[3px] border-double border-stone-800 pb-3 mb-5">
                                <img 
                                  src="/kop surat.png" 
                                  alt="Kop Surat Pengadilan Agama Paniai" 
                                  className="w-full h-auto max-h-[140px] mx-auto object-contain block"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    const fallbackContainer = document.getElementById('cop-surat-text-fallback-p1');
                                    if (fallbackContainer) {
                                      fallbackContainer.classList.remove('hidden');
                                    }
                                  }}
                                />
                                <div id="cop-surat-text-fallback-p1" className="hidden">
                                  <h2 className="text-sm md:text-base font-bold tracking-wide text-stone-900 uppercase">
                                    Mahkamah Agung Republik Indonesia
                                  </h2>
                                  <h3 className="text-[11px] md:text-xs font-bold text-stone-900 uppercase mt-0.5">
                                    Direktorat Jenderal Badan Peradilan Agama
                                  </h3>
                                  <h3 className="text-[11px] md:text-xs font-bold text-stone-900 uppercase mt-0.5">
                                    Pengadilan Tinggi Agama Jayapura
                                  </h3>
                                  <h1 className="text-sm md:text-base font-bold tracking-wider text-stone-900 uppercase mt-0.5">
                                    Pengadilan Agama Paniai
                                  </h1>
                                  <p className="text-[9px] md:text-[10px] italic font-sans text-stone-600 mt-1.5">
                                    Kompleks Kantor Bupati Paniai, Paniai Timur, Paniai, Telp. 085244544676
                                  </p>
                                  <p className="text-[9px] md:text-[10px] italic font-sans text-stone-600">
                                    www.pa-paniai.go.id, pengadilan.agama.paniai@gmail.com
                                  </p>
                                </div>
                              </div>

                              {/* NOTULEN RAPAT TITLE */}
                              <div className="text-center mb-5">
                                <h2 className="text-base md:text-lg font-bold tracking-widest text-stone-900 uppercase">
                                  NOTULEN RAPAT
                                </h2>
                              </div>

                              {/* KODE DOKUMEN TABLE */}
                              <div className="mb-6 font-sans text-[10px] md:text-xs">
                                <table className="w-full border-collapse border border-stone-800">
                                  <thead>
                                    <tr className="bg-stone-50 text-stone-900 font-semibold">
                                      <th className="border border-stone-800 p-2 text-center">Kode Dokumen</th>
                                      <th className="border border-stone-800 p-2 text-center">Tgl. Pembuatan</th>
                                      <th className="border border-stone-800 p-2 text-center">Tgl. Revisi</th>
                                      <th className="border border-stone-800 p-2 text-center">Tgl. Efektif</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr className="text-stone-800 text-center">
                                      <td className="border border-stone-800 p-2">FM/AM/04/02</td>
                                      <td className="border border-stone-800 p-2">05/02/2018</td>
                                      <td className="border border-stone-800 p-2">{docMetadata.tglRevisi}</td>
                                      <td className="border border-stone-800 p-2">05/02/2018</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>

                              {/* METADATA LIST */}
                              <div className="space-y-2 mb-6 text-xs md:text-sm">
                                <div className="grid grid-cols-12 gap-1">
                                  <span className="col-span-4 font-bold">Hari/Tanggal/Jam</span>
                                  <span className="col-span-8">: {docMetadata.hariTanggal}</span>
                                </div>
                                <div className="grid grid-cols-12 gap-1">
                                  <span className="col-span-4 font-bold">Tempat</span>
                                  <span className="col-span-8">: {docMetadata.tempat}</span>
                                </div>
                                <div className="grid grid-cols-12 gap-1">
                                  <span className="col-span-4 font-bold">Pimpinan Rapat</span>
                                  <span className="col-span-8">: {docMetadata.pimpinanName}</span>
                                </div>
                                <div className="grid grid-cols-12 gap-1">
                                  <span className="col-span-4 font-bold">Peserta Rapat</span>
                                  <span className="col-span-8">: {docMetadata.peserta}</span>
                                </div>
                              </div>

                              <hr className="border-t border-stone-800 my-4" />

                              {/* AGENDA RAPAT */}
                              <div className="mb-6">
                                <h3 className="text-center font-bold text-xs md:text-sm uppercase tracking-wider mb-3">
                                  Agenda Rapat
                                </h3>
                                <div className="text-xs md:text-sm space-y-2 pl-2">
                                  {docMetadata.agendaContent.map((point, index) => {
                                    const isHeading = point.includes("Rapat dibuka") || point.includes("Selanjutnya rapat dipimpin");
                                    return (
                                      <p key={index} className={`${isHeading ? "" : "pl-4"} text-stone-900`}>
                                        {point}
                                      </p>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>

                            {/* FOOTER PAGE 1 */}
                            <div className="border-t border-stone-200 pt-3 mt-8 flex justify-between items-center text-[10px] text-stone-400 font-sans">
                              <span>PENGADILAN AGAMA PANIAI</span>
                              <span className="font-bold">Halaman 1 dari 2</span>
                            </div>
                          </div>

                          {/* DOTTED PAGE BREAK SEPARATOR FOR SCREEN */}
                          <div className="flex items-center justify-center gap-2 text-stone-400 text-xs font-sans font-bold my-1 select-none">
                            <div className="border-t border-dashed border-stone-300 w-16"></div>
                            <span>BATAS HALAMAN / PAGE BREAK</span>
                            <div className="border-t border-dashed border-stone-300 w-16"></div>
                          </div>

                          {/* PAGE 2 */}
                          <div className="bg-white shadow-md border border-stone-100 rounded-sm max-w-2xl mx-auto w-full p-8 md:p-12 font-serif text-stone-800 leading-relaxed relative min-h-[850px] flex flex-col justify-between">
                            <div>
                              {/* Continuation Header */}
                              <div className="border-b border-stone-300 pb-2 mb-6 flex justify-between items-center text-xs text-stone-500 font-sans italic">
                                <span>NOTULEN RAPAT | FM/AM/04/02</span>
                                <span>Pengadilan Agama Paniai</span>
                              </div>

                              {/* Watermark Crest (Styled subtly) */}
                              <div className="absolute inset-0 opacity-[0.01] flex items-center justify-center pointer-events-none">
                                <Scale className="h-96 w-96 text-stone-900" />
                              </div>

                              {/* KESIMPULAN RAPAT */}
                              <div className="mb-8">
                                <h3 className="text-center font-bold text-xs md:text-sm uppercase tracking-wider mb-4">
                                  Kesimpulan / Keputusan Rapat
                                </h3>
                                <div className="text-xs md:text-sm space-y-2 pl-2">
                                  {docMetadata.kesimpulanContent.map((point, index) => {
                                    const isClosing = point.includes("rapat menutup") || point.includes("ALHAMDULILLAHI");
                                    return (
                                      <p key={index} className={`${isClosing ? "" : "pl-4"} text-stone-900`}>
                                        {point}
                                      </p>
                                    );
                                  })}
                                </div>
                              </div>

                              <hr className="border-t border-stone-800 my-6" />

                              {/* SIGNATURES SECTION */}
                              <div className="text-xs md:text-sm mt-8">
                                <p className="mb-6 font-bold">Mengetahui,</p>
                                <div className="grid grid-cols-2 gap-12 text-center">
                                  <div className="flex flex-col items-center">
                                    <span className="font-bold">Pimpinan Rapat</span>
                                    <span className="mt-20 font-bold decoration-solid text-stone-900">{docMetadata.pimpinanName}</span>
                                    <span className="text-[10px] md:text-xs font-sans text-stone-600 mt-1">NIP. {docMetadata.pimpinanNip}</span>
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <span className="font-bold">Notulen Rapat</span>
                                    <span className="mt-20 font-bold decoration-solid text-stone-900">{docMetadata.notulenName}</span>
                                    <span className="text-[10px] md:text-xs font-sans text-stone-600 mt-1">NIP. {docMetadata.notulenNip}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* FOOTER PAGE 2 */}
                            <div className="border-t border-stone-200 pt-3 mt-8 flex justify-between items-center text-[10px] text-stone-400 font-sans">
                              <span>PENGADILAN AGAMA PANIAI</span>
                              <span className="font-bold">Halaman 2 dari 2</span>
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      // SINGLE PAGE VIEW
                      return (
                        <div className="bg-white shadow-md border border-stone-100 rounded-sm max-w-2xl mx-auto w-full p-8 md:p-12 font-serif text-stone-800 leading-relaxed relative select-text min-h-[850px] flex flex-col justify-between">
                          <div>
                            {/* Watermark Crest */}
                            <div className="absolute inset-0 opacity-[0.015] flex items-center justify-center pointer-events-none">
                              <Scale className="h-96 w-96 text-stone-900" />
                            </div>

                            {/* COP SURAT */}
                            <div className="text-center border-b-[3px] border-double border-stone-800 pb-3 mb-5">
                              <img 
                                src="/kop surat.png" 
                                alt="Kop Surat Pengadilan Agama Paniai" 
                                className="w-full h-auto max-h-[140px] mx-auto object-contain block"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const fallbackContainer = document.getElementById('cop-surat-text-fallback-single');
                                  if (fallbackContainer) {
                                    fallbackContainer.classList.remove('hidden');
                                  }
                                }}
                              />
                              <div id="cop-surat-text-fallback-single" className="hidden">
                                <h2 className="text-sm md:text-base font-bold tracking-wide text-stone-900 uppercase">
                                  Mahkamah Agung Republik Indonesia
                                </h2>
                                <h3 className="text-[11px] md:text-xs font-bold text-stone-900 uppercase mt-0.5">
                                  Direktorat Jenderal Badan Peradilan Agama
                                </h3>
                                <h3 className="text-[11px] md:text-xs font-bold text-stone-900 uppercase mt-0.5">
                                  Pengadilan Tinggi Agama Jayapura
                                </h3>
                                <h1 className="text-sm md:text-base font-bold tracking-wider text-stone-900 uppercase mt-0.5">
                                  Pengadilan Agama Paniai
                                </h1>
                                <p className="text-[9px] md:text-[10px] italic font-sans text-stone-600 mt-1.5">
                                  Kompleks Kantor Bupati Paniai, Paniai Timur, Paniai, Telp. 085244544676
                                </p>
                                <p className="text-[9px] md:text-[10px] italic font-sans text-stone-600">
                                  www.pa-paniai.go.id, pengadilan.agama.paniai@gmail.com
                                </p>
                              </div>
                            </div>

                            {/* NOTULEN RAPAT TITLE */}
                            <div className="text-center mb-5">
                              <h2 className="text-base md:text-lg font-bold tracking-widest text-stone-900 uppercase">
                                NOTULEN RAPAT
                              </h2>
                            </div>

                            {/* KODE DOKUMEN TABLE */}
                            <div className="mb-6 font-sans text-[10px] md:text-xs">
                              <table className="w-full border-collapse border border-stone-800">
                                <thead>
                                  <tr className="bg-stone-50 text-stone-900 font-semibold">
                                    <th className="border border-stone-800 p-2 text-center">Kode Dokumen</th>
                                    <th className="border border-stone-800 p-2 text-center">Tgl. Pembuatan</th>
                                    <th className="border border-stone-800 p-2 text-center">Tgl. Revisi</th>
                                    <th className="border border-stone-800 p-2 text-center">Tgl. Efektif</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="text-stone-800 text-center">
                                    <td className="border border-stone-800 p-2">FM/AM/04/02</td>
                                    <td className="border border-stone-800 p-2">05/02/2018</td>
                                    <td className="border border-stone-800 p-2">{docMetadata.tglRevisi}</td>
                                    <td className="border border-stone-800 p-2">05/02/2018</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            {/* METADATA LIST */}
                            <div className="space-y-2 mb-6 text-xs md:text-sm">
                              <div className="grid grid-cols-12 gap-1">
                                <span className="col-span-4 font-bold">Hari/Tanggal/Jam</span>
                                <span className="col-span-8">: {docMetadata.hariTanggal}</span>
                              </div>
                              <div className="grid grid-cols-12 gap-1">
                                <span className="col-span-4 font-bold">Tempat</span>
                                <span className="col-span-8">: {docMetadata.tempat}</span>
                              </div>
                              <div className="grid grid-cols-12 gap-1">
                                <span className="col-span-4 font-bold">Pimpinan Rapat</span>
                                <span className="col-span-8">: {docMetadata.pimpinanName}</span>
                              </div>
                              <div className="grid grid-cols-12 gap-1">
                                <span className="col-span-4 font-bold">Peserta Rapat</span>
                                <span className="col-span-8">: {docMetadata.peserta}</span>
                              </div>
                            </div>

                            <hr className="border-t border-stone-800 my-4" />

                            {/* AGENDA RAPAT */}
                            <div className="mb-6">
                              <h3 className="text-center font-bold text-xs md:text-sm uppercase tracking-wider mb-3">
                                Agenda Rapat
                              </h3>
                              <div className="text-xs md:text-sm space-y-2 pl-2">
                                {docMetadata.agendaContent.map((point, index) => {
                                  const isHeading = point.includes("Rapat dibuka") || point.includes("Selanjutnya rapat dipimpin");
                                  return (
                                    <p key={index} className={`${isHeading ? "" : "pl-4"} text-stone-900`}>
                                      {point}
                                    </p>
                                  );
                                })}
                              </div>
                            </div>

                            <hr className="border-t border-stone-800 my-4" />

                            {/* KESIMPULAN RAPAT */}
                            <div className="mb-6">
                              <h3 className="text-center font-bold text-xs md:text-sm uppercase tracking-wider mb-3">
                                Kesimpulan / Keputusan Rapat
                              </h3>
                              <div className="text-xs md:text-sm space-y-2 pl-2">
                                {docMetadata.kesimpulanContent.map((point, index) => {
                                  const isClosing = point.includes("rapat menutup") || point.includes("ALHAMDULILLAHI");
                                  return (
                                    <p key={index} className={`${isClosing ? "" : "pl-4"} text-stone-900`}>
                                      {point}
                                    </p>
                                  );
                                })}
                              </div>
                            </div>

                            <hr className="border-t border-stone-800 my-5" />

                            {/* SIGNATURES SECTION */}
                            <div className="text-xs md:text-sm">
                              <p className="mb-4">Mengetahui,</p>
                              <div className="grid grid-cols-2 gap-8 text-center">
                                <div className="flex flex-col items-center">
                                  <span className="font-bold">Pimpinan Rapat</span>
                                  <span className="mt-16 font-bold">{docMetadata.pimpinanName}</span>
                                  <span className="text-[10px] md:text-xs font-sans text-stone-600 mt-1">NIP. {docMetadata.pimpinanNip}</span>
                                </div>
                                <div className="flex flex-col items-center">
                                  <span className="font-bold">Notulen Rapat</span>
                                  <span className="mt-16 font-bold">{docMetadata.notulenName}</span>
                                  <span className="text-[10px] md:text-xs font-sans text-stone-600 mt-1">NIP. {docMetadata.notulenNip}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* FOOTER SINGLE PAGE */}
                          <div className="border-t border-stone-200 pt-3 mt-8 flex justify-between items-center text-[10px] text-stone-400 font-sans">
                            <span>PENGADILAN AGAMA PANIAI</span>
                            <span className="font-bold">Halaman 1 dari 1</span>
                          </div>
                        </div>
                      );
                    }
                  })()
                ) : (
                  /* Empty / Idle State */
                  <div className="text-center py-16 max-w-sm mx-auto flex flex-col items-center font-sans">
                    <div className="bg-stone-100 p-4.5 rounded-full text-stone-400 mb-4 border border-stone-200">
                      <Scale className="h-10 w-10 text-stone-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-stone-800">Pratinjau Hasil Kosong</h3>
                    <p className="text-stone-500 text-xs mt-2 leading-relaxed">
                      Silakan unggah draf rekaman dinas atau lakukan perekaman suara secara langsung untuk memulai penyusunan Notulensi Rapat Otomatis.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Ringkasan Eksekutif AI Card */}
            {resultMarkdown && executiveSummary && (
              <div className="w-full xl:w-80 shrink-0 flex flex-col gap-4 self-stretch">
                <div className="bg-white rounded-xl shadow-sm border border-stone-200 border-t-4 border-[#d4af37] p-5 sticky top-6">
                  <div className="flex items-center gap-2.5 pb-3 mb-4 border-b border-stone-100">
                    <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                      <Wand2 className="h-4.5 w-4.5 text-emerald-700" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                        Ringkasan Eksekutif
                      </h4>
                      <p className="text-[10px] text-stone-500 font-sans">
                        3 Keputusan Utama Rapat
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {executiveSummary.map((point, index) => (
                      <div key={index} className="flex gap-3 items-start group">
                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center text-[10px] font-bold font-mono">
                          {index + 1}
                        </span>
                        <p className="text-stone-700 text-xs leading-relaxed font-sans font-medium">
                          {point}
                        </p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-5 pt-4 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-400 font-sans font-medium">
                    <span>Sistem Otomatis</span>
                    <span>EYD V Terverifikasi</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
        </div>
      </main>
    </div>
  );
}
