"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Mic,
  Square,
  Upload,
  FileAudio,
  Copy,
  Check,
  RefreshCw,
  Scale,
  Sparkles,
  Download,
  AlertCircle
} from "lucide-react";

export default function Home() {
  const [inputMethod, setInputMethod] = useState("record");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [resultMarkdown, setResultMarkdown] = useState("");
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [recordTime, setRecordTime] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  
  // Visualizer bar heights state for micro-interactions
  const [vizHeights, setVizHeights] = useState(Array(15).fill(4));

  // Audio recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordTime((prev) => prev + 1);
        // Random visualizer bounce effect during recording
        setVizHeights(Array(15).fill(0).map(() => Math.floor(Math.random() * 24) + 6));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setRecordTime(0);
      setVizHeights(Array(15).fill(4));
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  // Start recording
  const startRecording = async () => {
    setError(null);
    setRecordedBlob(null);
    setRecordedUrl(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setRecordedBlob(audioBlob);
        setRecordedUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      setError("Gagal mengakses mikrofon. Pastikan Anda mengizinkan akses mikrofon di perangkat Anda.");
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // File selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  // Format record timer (MM:SS)
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Process audio using Next.js backend API
  const handleProcessAudio = async () => {
    if (inputMethod === "record" && !recordedBlob) {
      setError("Silakan rekam audio terlebih dahulu.");
      return;
    }
    if (inputMethod === "upload" && !selectedFile) {
      setError("Silakan pilih file audio terlebih dahulu.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResultMarkdown("");

    const steps = [
      "Mengunggah file audio ke server...",
      "Menganalisis audio & transkripsi suara...",
      "Menyusun tata bahasa naskah dinas...",
      "Memformat naskah ke template Pengadilan Agama Paniai...",
      "Menyelesaikan hasil notulensi..."
    ];

    let currentStep = 0;
    setProgressMessage(steps[0]);

    const interval = setInterval(() => {
      if (currentStep < steps.length - 1) {
        currentStep++;
        setProgressMessage(steps[currentStep]);
      }
    }, 4500);

    try {
      const formData = new FormData();
      if (inputMethod === "upload" && selectedFile) {
        formData.append("audio", selectedFile, selectedFile.name);
      } else if (inputMethod === "record" && recordedBlob) {
        formData.append("audio", recordedBlob, "rekaman_langsung.webm");
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      let data = {};
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Server Error (${response.status}): ${text.slice(0, 200)}`);
      }

      if (!response.ok) {
        throw new Error(data.error || "Gagal memproses audio.");
      }

      setResultMarkdown(data.result);
    } catch (err) {
      console.error(err);
      setError(err.message || "Terjadi kesalahan saat memproses audio.");
    } finally {
      clearInterval(interval);
      setIsProcessing(false);
    }
  };

  // Copy result to clipboard
  const handleCopy = () => {
    if (!resultMarkdown) return;
    navigator.clipboard.writeText(resultMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download raw txt file
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

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 font-sans flex flex-col selection:bg-amber-100 selection:text-amber-900">
      {/* HEADER */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10 py-4 px-6 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-amber-800 rounded-lg flex items-center justify-center text-white shadow-md">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-sm md:text-base font-bold tracking-wide text-stone-900 uppercase">
                Pengadilan Agama Paniai
              </h1>
              <p className="text-[10px] md:text-xs text-amber-800 font-semibold tracking-wider uppercase">
                Sistem Notulensi Digital Otomatis
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center space-x-2 text-xs text-stone-500 font-medium">
            <span className="h-2 w-2 bg-emerald-500 rounded-full animate-ping"></span>
            <span>Gemini AI Engine Active</span>
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 space-y-8">
        {/* UPPER CARD: INTERACTIVE INTERFACE */}
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
          {/* NAV TABS */}
          <div className="flex border-b border-stone-100 bg-stone-50/50">
            <button
              onClick={() => { setInputMethod("record"); setError(null); }}
              className={`flex-1 py-4 text-center font-semibold text-xs md:text-sm tracking-wider uppercase border-b-2 flex items-center justify-center space-x-2 transition-all ${
                inputMethod === "record"
                  ? "border-amber-800 text-amber-800 bg-white"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              <Mic className="h-4 w-4" />
              <span>Rekam Langsung</span>
            </button>
            <button
              onClick={() => { setInputMethod("upload"); setError(null); }}
              className={`flex-1 py-4 text-center font-semibold text-xs md:text-sm tracking-wider uppercase border-b-2 flex items-center justify-center space-x-2 transition-all ${
                inputMethod === "upload"
                  ? "border-amber-800 text-amber-800 bg-white"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              <Upload className="h-4 w-4" />
              <span>Unggah Audio</span>
            </button>
          </div>

          <div className="p-6 md:p-10 text-center">
            {/* RECORD AUDIO SECTION */}
            {inputMethod === "record" && (
              <div className="space-y-6">
                <div className="max-w-md mx-auto p-8 rounded-2xl bg-stone-50 border border-stone-200/60 relative overflow-hidden flex flex-col items-center">
                  {isRecording && (
                    <div className="absolute top-3 right-3 flex items-center space-x-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-600 text-[10px] font-bold tracking-widest uppercase animate-pulse">
                      <span className="h-1.5 w-1.5 bg-red-600 rounded-full"></span>
                      <span>REKAMPAD</span>
                    </div>
                  )}

                  <p className="text-xs text-stone-500 font-semibold tracking-wide uppercase mb-3">
                    {isRecording ? "Sedang Merekam Suara Rapat..." : "Siap Merekam"}
                  </p>

                  {/* VISUALIZER WAVE */}
                  <div className="flex items-center justify-center space-x-1 h-16 w-full max-w-[240px] mb-4">
                    {vizHeights.map((h, i) => (
                      <span
                        key={i}
                        className={`w-1 rounded-full transition-all duration-150 ${
                          isRecording ? "bg-amber-700 animate-pulse" : "bg-stone-300"
                        }`}
                        style={{ height: `${h}px` }}
                      ></span>
                    ))}
                  </div>

                  <p className="text-3xl font-mono font-bold text-stone-800 mb-6">
                    {isRecording ? formatTime(recordTime) : "00:00"}
                  </p>

                  <div className="flex items-center justify-center space-x-4">
                    {!isRecording ? (
                      <button
                        onClick={startRecording}
                        disabled={isProcessing}
                        className="h-16 w-16 bg-amber-800 hover:bg-amber-950 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-amber-900/20 active:scale-95 transition-all group disabled:opacity-50"
                      >
                        <Mic className="h-7 w-7 group-hover:scale-110 transition-transform" />
                      </button>
                    ) : (
                      <button
                        onClick={stopRecording}
                        className="h-16 w-16 bg-stone-900 hover:bg-black text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all group"
                      >
                        <Square className="h-6 w-6" />
                      </button>
                    )}
                  </div>
                </div>

                {/* PLAYBACK RECORDED AUDIO */}
                {recordedUrl && !isRecording && (
                  <div className="max-w-md mx-auto p-4 rounded-xl bg-amber-50/50 border border-amber-200/40 flex flex-col items-center gap-2">
                    <div className="flex items-center space-x-2">
                      <FileAudio className="h-5 w-5 text-amber-800 flex-shrink-0" />
                      <span className="text-xs font-semibold text-stone-700">Hasil rekaman suara siap diproses</span>
                    </div>
                    <audio src={recordedUrl} controls className="w-full h-10 mt-1" />
                  </div>
                )}
              </div>
            )}

            {/* UPLOAD FILE SECTION */}
            {inputMethod === "upload" && (
              <div className="space-y-6">
                <div className="max-w-md mx-auto">
                  <label className="flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-stone-300 rounded-2xl bg-stone-50 hover:bg-stone-100/50 cursor-pointer transition-all p-6 group">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="p-3 bg-white rounded-full shadow border border-stone-200 text-stone-500 group-hover:text-amber-800 group-hover:scale-110 transition-all">
                        <Upload className="h-6 w-6" />
                      </div>
                      <p className="text-xs font-semibold text-stone-700">
                        {selectedFile ? selectedFile.name : "Klik atau seret file audio kesini"}
                      </p>
                      <p className="text-[10px] text-stone-500 font-medium">
                        Mendukung format MP3, WAV, atau M4A (Maks. 50MB)
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={isProcessing}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* PROCESS BUTTON */}
            <div className="mt-8">
              <button
                onClick={handleProcessAudio}
                disabled={isProcessing || (inputMethod === "record" && !recordedBlob) || (inputMethod === "upload" && !selectedFile)}
                className="w-full max-w-md bg-amber-800 hover:bg-amber-950 text-white py-4 px-6 rounded-xl font-bold text-sm tracking-widest uppercase shadow-md hover:shadow-lg disabled:opacity-50 disabled:hover:shadow-none active:scale-98 transition-all flex items-center justify-center space-x-3 mx-auto"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>MEMPROSES AUDIO RAPAT...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    <span>PROSES NOTULENSI DIGITAL</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* LOADING ANIMATION */}
        {isProcessing && (
          <div className="p-8 bg-white border border-stone-200 rounded-xl shadow-sm text-center space-y-4">
            <div className="flex justify-center space-x-1.5">
              <span className="h-3 bg-amber-800 rounded-full w-3 animate-bounce [animation-delay:-0.3s]"></span>
              <span className="h-3 bg-amber-800 rounded-full w-3 animate-bounce [animation-delay:-0.15s]"></span>
              <span className="h-3 bg-amber-800 rounded-full w-3 animate-bounce"></span>
            </div>
            <h3 className="text-xs md:text-sm font-bold tracking-wider uppercase text-amber-900">
              Gemini AI Sedang Menulis Notulen
            </h3>
            <p className="text-stone-500 text-xs md:text-sm italic font-medium max-w-sm mx-auto">
              "{progressMessage}"
            </p>
          </div>
        )}

        {/* ERROR DISPLAY */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start space-x-3 max-w-md mx-auto">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Terjadi Kesalahan</p>
              <p className="text-xs mt-1 text-red-600 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* NOTULEN RESULTS DISPLAY */}
        {resultMarkdown && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-amber-50/50 border border-amber-200/50 rounded-xl">
              <span className="text-xs font-semibold text-amber-900 uppercase tracking-wider flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-amber-700" />
                <span>Hasil Notulensi Rapat Tersedia!</span>
              </span>
              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  onClick={handleCopy}
                  className="px-3.5 py-2 text-stone-700 bg-white border border-stone-200 rounded-lg text-xs font-semibold hover:bg-stone-50 shadow-sm flex items-center space-x-1.5 active:scale-95 transition-all"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-600">Disalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-stone-500" />
                      <span>Salin Notulen</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownloadTxt}
                  className="px-3.5 py-2 text-stone-700 bg-white border border-stone-200 rounded-lg text-xs font-semibold hover:bg-stone-50 shadow-sm flex items-center space-x-1.5 active:scale-95 transition-all"
                >
                  <Download className="h-3.5 w-3.5 text-stone-500" />
                  <span>Unduh TXT</span>
                </button>
              </div>
            </div>

            {/* PREVIEW PAPER SHEET */}
            <div className="bg-white shadow-md border border-stone-200 rounded-sm max-w-2xl mx-auto w-full p-8 md:p-12 font-serif text-stone-800 leading-relaxed relative overflow-hidden">
              {/* Fallback textual header preview */}
              <div className="text-center border-b-[3px] border-double border-stone-800 pb-4 mb-5">
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

              {/* Markdown content */}
              <div className="prose prose-stone max-w-none text-xs md:text-sm font-sans whitespace-pre-wrap">
                {resultMarkdown}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-stone-900 text-stone-400 py-6 text-center text-xs mt-12 border-t border-stone-800 font-medium">
        <p>© {new Date().getFullYear()} Pengadilan Agama Paniai. Hak Cipta Dilindungi.</p>
        <p className="text-stone-600 mt-1">Sistem Notulensi Terenkripsi & Didukung oleh Google Gemini 3.5-flash</p>
      </footer>
    </div>
  );
}
