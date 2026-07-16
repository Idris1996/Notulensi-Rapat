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
  Code
} from "lucide-react";

export default function App() {
  // Input Method: 'upload' or 'record'
  const [inputMethod, setInputMethod] = useState<"upload" | "record">("upload");

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
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
  const [error, setError] = useState<string | null>(null);

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
      validateAndSetFile(files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    if (file.type.startsWith("audio/")) {
      setSelectedFile(file);
      setAudioUrl(URL.createObjectURL(file));
      setError(null);
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
    setRecordedBlob(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordingDuration(0);
    setError(null);
    setRealtimeTranscript("");
    setInterimTranscript("");
  };

  // Call the backend to process the audio via Gemini API (uses direct-to-Gemini resumable upload to bypass Vercel limits)
  const handleProcessAudio = async () => {
    const fileToProcess = inputMethod === "upload" ? selectedFile : recordedBlob;
    if (!fileToProcess) {
      setError("Silakan pilih atau rekam audio terlebih dahulu.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResultMarkdown(null);
    setProgressPercent(0);
    setProgressMessage("Mempersiapkan berkas audio...");

    let stepInterval: NodeJS.Timeout | null = null;
    let percentInterval: NodeJS.Timeout | null = null;

    try {
      let fileUri = "";
      let mimeType = fileToProcess.type || (inputMethod === "record" ? "audio/webm" : "audio/mpeg");
      if (mimeType.includes(";")) {
        mimeType = mimeType.split(";")[0].trim();
      }
      if (mimeType === "video/webm") {
        mimeType = "audio/webm";
      }

      // 1. Try to get direct-to-Gemini upload URL from server to bypass 4.5MB Vercel body limit
      let uploadUrl = "";
      try {
        const initRes = await fetch("/api/get-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileSize: fileToProcess.size,
            mimeType: mimeType,
            displayName: inputMethod === "upload" && selectedFile ? selectedFile.name : "rekaman_langsung.webm",
          }),
        });

        if (initRes.ok) {
          const initData = await initRes.json();
          uploadUrl = initData.uploadUrl;
        } else {
          const errText = await initRes.text();
          let parsedErr = "";
          try {
            parsedErr = JSON.parse(errText).error;
          } catch (e) {}
          throw new Error(parsedErr || `Gagal menginisialisasi rute upload (HTTP ${initRes.status}): ${errText.slice(0, 150)}`);
        }
      } catch (uploadInitErr: any) {
        console.error("Direct-to-Gemini upload initialization failed:", uploadInitErr);
        if (fileToProcess.size > 4 * 1024 * 1024) {
          throw new Error(`Ukuran berkas terlalu besar (${(fileToProcess.size / (1024 * 1024)).toFixed(2)}MB). Gagal menggunakan jalur upload langsung: ${uploadInitErr.message}. Silakan pastikan environment server Anda sudah terkonfigurasi dengan benar.`);
        }
        console.warn("Direct-to-Gemini upload initialization failed, falling back to legacy multipart upload since file is small:", uploadInitErr);
      }

      let data: any = {};

      if (uploadUrl) {
        // A. DIRECT RESUMABLE UPLOAD VIA GOOGLE'S SERVERS (NO VERCEL SIZE LIMIT)
        setProgressMessage("Mengunggah berkas audio langsung ke Google (0%)...");
        
        const uploadResult = await new Promise<any>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", uploadUrl, true);
          xhr.setRequestHeader("X-Goog-Upload-Offset", "0");
          xhr.setRequestHeader("X-Goog-Upload-Command", "upload, finalize");

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 90); // Scale upload progress to 90%
              setProgressPercent(percent);
              setProgressMessage(`Mengunggah berkas audio langsung ke Google (${percent}%)...`);
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
              reject(new Error(`Pengunggahan ke Google gagal (Status ${xhr.status}): ${xhr.responseText}`));
            }
          };

          xhr.onerror = () => reject(new Error("Terjadi galat koneksi jaringan saat mengunggah langsung ke Google."));
          xhr.send(fileToProcess);
        });

        fileUri = uploadResult.file?.uri || "";
        if (!fileUri) {
          throw new Error("Gagal mendapatkan file URI dari server Google.");
        }

        // Now initiate server-side inference on the uploaded file reference
        setProgressPercent(92);
        setProgressMessage("Menganalisis audio & menyusun tata naskah dinas Pengadilan Agama Paniai...");

        // Slow progress tick during Gemini transcription
        percentInterval = setInterval(() => {
          setProgressPercent((prev) => (prev < 98 ? prev + 1 : prev));
        }, 1500);

        const response = await fetch("/api/process-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileUri: fileUri,
            mimeType: mimeType,
            realtimeTranscript: realtimeTranscript,
          }),
        });

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          data = await response.json();
        } else {
          const text = await response.text();
          throw new Error(`Server Error (${response.status}): ${text.slice(0, 200)}`);
        }

        if (!response.ok) {
          throw new Error(data.error || "Gagal memproses draf rapat.");
        }

      } else {
        // B. LEGACY FALLBACK FOR MULTIPART UPLOAD (FOR DEV / COMPATIBILITY)
        setProgressMessage("Mengunggah berkas audio rapat ke server...");
        
        // Dynamic loading messages
        const steps = [
          "Mengunggah berkas audio rapat ke server...",
          "Mengirimkan audio ke Gemini 3.5-flash...",
          "Gemini sedang mentranskripsi percakapan...",
          "Menyusun tata naskah dinas Pengadilan Agama Paniai...",
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
        }, 4500);

        percentInterval = setInterval(() => {
          setProgressPercent((prev) => {
            if (prev < 30) return prev + Math.floor(Math.random() * 4) + 3;
            else if (prev < 80) return prev + Math.floor(Math.random() * 2) + 1;
            else if (prev < 98) return prev + 1;
            return prev;
          });
        }, 500);

        const formData = new FormData();
        if (inputMethod === "upload" && selectedFile) {
          formData.append("audio", selectedFile, selectedFile.name);
        } else if (inputMethod === "record" && recordedBlob) {
          formData.append("audio", recordedBlob, "rekaman_langsung.webm");
        }

        if (realtimeTranscript && realtimeTranscript.trim().length > 0) {
          formData.append("realtimeTranscript", realtimeTranscript);
        }

        const response = await fetch("/api/process-audio", {
          method: "POST",
          body: formData,
        });

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          data = await response.json();
        } else {
          const text = await response.text();
          throw new Error(`Server Error (${response.status}): ${text.slice(0, 200)}`);
        }

        if (!response.ok) {
          throw new Error(data.error || "Gagal memproses audio rapat.");
        }
      }

      // On successful transcription, jump progress to 100% and wait a moment for completion feel
      setProgressPercent(100);
      setProgressMessage("Draf notulensi dinas berhasil diselesaikan!");
      await new Promise((resolve) => setTimeout(resolve, 800));

      setResultMarkdown(data.result);
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
    const lines = md.split("\n");
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
      if (trimmed.startsWith("Hari/Tanggal/Jam")) {
        hariTanggal = trimmed.split(":")[1]?.trim() || hariTanggal;
      } else if (trimmed.startsWith("Tempat")) {
        tempat = trimmed.split(":")[1]?.trim() || tempat;
      } else if (trimmed.startsWith("Pimpinan Rapat")) {
        pimpinan = trimmed.split(":")[1]?.trim() || pimpinan;
      } else if (trimmed.startsWith("Peserta Rapat")) {
        peserta = trimmed.split(":")[1]?.trim() || peserta;
      } else if (trimmed.toLowerCase().includes("agenda rapat")) {
        isAgenda = true;
        isKesimpulan = false;
      } else if (trimmed.toLowerCase().includes("kesimpulan rapat") || trimmed.toLowerCase().includes("kesimpulan rapat sebagai berikut")) {
        isAgenda = false;
        isKesimpulan = true;
      } else if (trimmed.startsWith("---") || trimmed.startsWith("===") || trimmed.startsWith("Mengetahui")) {
        isAgenda = false;
        isKesimpulan = false;
      } else {
        if (isAgenda && trimmed) {
          agendaContent.push(trimmed);
        } else if (isKesimpulan && trimmed) {
          kesimpulanContent.push(trimmed);
        }
      }
    });

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
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input Panel */}
        <section className="lg:col-span-5 flex flex-col gap-6">
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
                className={`flex-1 py-3.5 px-4 text-xs font-semibold border-b-2 flex items-center justify-center gap-2 transition-all ${
                  inputMethod === "upload"
                    ? "border-[#064e3b] text-[#064e3b] bg-white font-bold"
                    : "border-transparent text-stone-500 hover:text-stone-800 hover:bg-stone-100/50"
                }`}
              >
                <Upload className="h-4 w-4" />
                Unggah File Audio
              </button>
              <button
                onClick={() => {
                  setInputMethod("record");
                  clearAudio();
                }}
                className={`flex-1 py-3.5 px-4 text-xs font-semibold border-b-2 flex items-center justify-center gap-2 transition-all ${
                  inputMethod === "record"
                    ? "border-[#064e3b] text-[#064e3b] bg-white font-bold"
                    : "border-transparent text-stone-500 hover:text-stone-800 hover:bg-stone-100/50"
                }`}
              >
                <Mic className="h-4 w-4" />
                Rekam Mikrofon
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
                    <span className="mt-3 text-xs bg-emerald-50 text-emerald-700 font-mono py-1 px-2.5 rounded-full border border-emerald-100">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  )}
                </div>
              ) : (
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
              {(selectedFile || recordedBlob) && (
                <button
                  onClick={clearAudio}
                  disabled={isProcessing}
                  className="mt-4 w-full py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Hapus & Reset Audio
                </button>
              )}

              {/* Process Button */}
              <button
                onClick={handleProcessAudio}
                disabled={isProcessing || (!selectedFile && !recordedBlob)}
                className={`w-full mt-5 py-3 px-4 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-2.5 transition-all ${
                  isProcessing || (!selectedFile && !recordedBlob)
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
        <section className="lg:col-span-7 flex flex-col gap-4">
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

          {/* Paper View Container */}
          <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden flex-1 flex flex-col min-h-[500px]">
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
                /* Beautiful Paper Layout with Real-time styling */
                <div className="bg-white shadow-md border border-stone-100 rounded-sm max-w-2xl mx-auto w-full p-8 md:p-12 font-serif text-stone-800 leading-relaxed relative select-text min-h-[850px]">
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
                        // Fallback to text header if image fails to load
                        e.currentTarget.style.display = 'none';
                        const fallbackContainer = document.getElementById('cop-surat-text-fallback');
                        if (fallbackContainer) {
                          fallbackContainer.classList.remove('hidden');
                        }
                      }}
                    />
                    <div id="cop-surat-text-fallback" className="hidden">
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
                    <h2 className="text-base md:text-lg font-bold tracking-widest text-stone-900 uppercase decoration-double">
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
                          <td className="border border-stone-800 p-2">02/05/2018</td>
                          <td className="border border-stone-800 p-2">{docMetadata.tglRevisi}</td>
                          <td className="border border-stone-800 p-2">02/05/2018</td>
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
                      <span className="col-span-8">: {docMetadata.pimpinan}</span>
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
                        // Check if it matches opening sentences or numeric points
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
                        <span className="mt-16 font-bold">{docMetadata.pimpinan.split(" (")[0]}</span>
                        <span className="text-[10px] md:text-xs font-sans text-stone-600 mt-1">NIP. .....................</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="font-bold">Notulen Rapat</span>
                        <span className="mt-16 font-bold">Notulen Pengadilan</span>
                        <span className="text-[10px] md:text-xs font-sans text-stone-600 mt-1">NIP. .....................</span>
                      </div>
                    </div>
                  </div>
                </div>
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
        </section>
      </main>
    </div>
  );
}
