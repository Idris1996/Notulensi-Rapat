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
  const [progressPercent, setProgressPercent] = useState(0);
  const [resultMarkdown, setResultMarkdown] = useState("");
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [useRealtimeSpeech, setUseRealtimeSpeech] = useState(false);
  const [realtimeTranscript, setRealtimeTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);
  const [vizHeights, setVizHeights] = useState(Array(15).fill(4));

  // Timer for direct microphone recording
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordTime((prev) => prev + 1);
        setVizHeights(Array(15).fill(0).map(() => Math.floor(Math.random() * 24) + 6));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setRecordTime(0);
      setVizHeights(Array(15).fill(4));
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  // Web Speech API for real-time transcription
  useEffect(() => {
    if (typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "id-ID";

      rec.onresult = (event) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript + " ";
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        if (final) {
          setRealtimeTranscript((prev) => prev + final);
        }
        setInterimTranscript(interim);
      };

      rec.onerror = (e) => {
        console.error("Speech recognition error:", e);
      };

      recognitionRef.current = rec;
    }
  }, []);

  // Control Web Speech API along with recording state
  useEffect(() => {
    if (isRecording && useRealtimeSpeech && recognitionRef.current) {
      try {
        setRealtimeTranscript("");
        setInterimTranscript("");
        recognitionRef.current.start();
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
      }
    } else if (!isRecording && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        // Already stopped
      }
    }
  }, [isRecording, useRealtimeSpeech]);

  // Start direct mic recording
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
      setError("Gagal mengakses mikrofon. Silakan berikan izin mikrofon pada browser atau HP Anda.");
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Handle uploaded file selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Fetch API /api/process-audio via relative URL (uses direct-to-Gemini resumable upload to bypass Vercel limits)
  const handleProcessAudio = async () => {
    const fileToProcess = inputMethod === "upload" ? selectedFile : recordedBlob;
    if (!fileToProcess) {
      setError(inputMethod === "upload" ? "Silakan pilih file audio rapat terlebih dahulu." : "Silakan rekam suara rapat terlebih dahulu.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResultMarkdown("");
    setProgressPercent(5);
    setProgressMessage("Mempersiapkan berkas audio...");

    let progressTimer = null;

    try {
      let mimeType = fileToProcess.type || (inputMethod === "record" ? "audio/webm" : "audio/mpeg");
      if (mimeType.includes(";")) {
        mimeType = mimeType.split(";")[0].trim();
      }
      if (mimeType === "video/webm") {
        mimeType = "audio/webm";
      }

      // 1. Try to get direct-to-Gemini upload URL from Next.js serverless route
      let uploadUrl = "";
      try {
        const initRes = await fetch("/api/get-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileSize: fileToProcess.size,
            mimeType: mimeType,
            displayName: inputMethod === "upload" ? selectedFile.name : "rekaman_notulen.webm",
          }),
        });

        if (initRes.ok) {
          const initData = await initRes.json();
          uploadUrl = initData.uploadUrl;
        }
      } catch (uploadInitErr) {
        console.warn("Direct-to-Gemini upload initialization failed, falling back to legacy multipart upload:", uploadInitErr);
      }

      let data = {};

      if (uploadUrl) {
        // A. DIRECT RESUMABLE UPLOAD VIA GOOGLE'S SERVERS (NO VERCEL SIZE LIMIT)
        setProgressMessage("Mengunggah berkas audio langsung ke Google (0%)...");
        
        const uploadResult = await new Promise((resolve, reject) => {
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

        const fileUri = uploadResult.file?.uri || "";
        if (!fileUri) {
          throw new Error("Gagal mendapatkan file URI dari server Google.");
        }

        // Now initiate server-side inference on the uploaded file reference
        setProgressPercent(92);
        setProgressMessage("Menganalisis audio & menyusun tata naskah dinas Pengadilan Agama Paniai...");

        // Slow progress tick during Gemini transcription
        progressTimer = setInterval(() => {
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

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await response.json();
        } else {
          const textStr = await response.text();
          throw new Error(`Server Error (${response.status}): ${textStr.slice(0, 150)}`);
        }

        if (!response.ok) {
          throw new Error(data.error || `Gagal menyusun notulensi rapat (Status ${response.status}).`);
        }

      } else {
        // B. LEGACY FALLBACK FOR MULTIPART UPLOAD
        setProgressMessage("Mengunggah berkas audio ke peladen...");
        
        // Staggered progressive indicators
        progressTimer = setInterval(() => {
          setProgressPercent((prev) => {
            if (prev < 30) {
              setProgressMessage("Membaca dan memproses gelombang audio...");
              return prev + 5;
            } else if (prev < 65) {
              setProgressMessage("Mentranskripsikan ucapan dan mencocokkan kata...");
              return prev + 3;
            } else if (prev < 90) {
              setProgressMessage("Menyusun draf notulensi dinas format PA Paniai...");
              return prev + 2;
            } else if (prev < 98) {
              setProgressMessage("Menyelesaikan finalisasi draf...");
              return prev + 1;
            }
            return prev;
          });
        }, 1500);

        const formData = new FormData();
        if (inputMethod === "upload" && selectedFile) {
          formData.append("file", selectedFile, selectedFile.name);
        } else if (inputMethod === "record" && recordedBlob) {
          formData.append("file", recordedBlob, "rekaman_notulen.webm");
        }

        if (realtimeTranscript) {
          formData.append("notes", realtimeTranscript);
        }

        const response = await fetch("/api/process-audio", {
          method: "POST",
          body: formData,
        });

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await response.json();
        } else {
          const textStr = await response.text();
          throw new Error(`Server Error (${response.status}): ${textStr.slice(0, 150)}`);
        }

        if (!response.ok) {
          throw new Error(data.error || `Gagal menyusun notulensi rapat (Status ${response.status}).`);
        }
      }

      setProgressPercent(100);
      setProgressMessage("Penyusunan selesai!");
      setResultMarkdown(data.result);
    } catch (err) {
      console.error(err);
      setError(err.message || "Terjadi galat koneksi atau kegagalan server.");
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setIsProcessing(false);
    }
  };

  const handleCopy = () => {
    if (!resultMarkdown) return;
    navigator.clipboard.writeText(resultMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    if (!resultMarkdown) return;
    const blob = new Blob([resultMarkdown], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Notulensi_PA_Paniai.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#fdfcf9] text-stone-800 flex flex-col font-sans selection:bg-emerald-100 selection:text-[#064e3b]">
      {/* HEADER BANNER */}
      <header className="bg-[#064e3b] text-[#fdfcf9] py-4 px-6 shadow-md border-b-2 border-[#d4af37] shrink-0">
        <div className="max-w-4xl mx-auto flex items-center gap-4 w-full">
          <div className="bg-white/10 rounded-lg p-2 border border-white/20 shadow-inner">
            <Scale className="h-7 w-7 text-[#fdfcf9]" />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-bold tracking-tight uppercase">
              Sistem Notulensi Rapat Otomatis <span className="text-xs font-normal lowercase italic text-emerald-300 ml-1 font-sans normal-case">by idris</span>
            </h1>
            <p className="text-[9px] md:text-xs uppercase tracking-wider opacity-90 font-medium">
              Pengadilan Agama Paniai • Mahkamah Agung RI
            </p>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* WELCOME INSTRUCTION */}
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-4 md:p-5">
          <h2 className="text-sm font-bold text-stone-900 mb-1.5 flex items-center gap-2">
            ⚖️ Notulen Rapat Dinas Profesional
          </h2>
          <p className="text-xs text-stone-500 leading-relaxed">
            Gunakan perekam suara langsung melalui mikrofon HP/Laptop atau unggah berkas audio rapat untuk menghasilkan draf Notulensi Rapat resmi yang eksat, faktual, dan bebas halusinasi.
          </p>
        </div>

        {/* CONTROLS AND FORMS */}
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
          {/* TABS */}
          <div className="flex border-b border-stone-100 bg-stone-50/50">
            <button
              onClick={() => { setInputMethod("record"); setError(null); }}
              className={`flex-1 py-3 text-center font-semibold text-xs uppercase tracking-wider border-b-2 flex items-center justify-center space-x-2 transition-all ${
                inputMethod === "record"
                  ? "border-[#064e3b] text-[#064e3b] bg-white"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              <Mic className="h-3.5 w-3.5" />
              <span>Rekam Langsung</span>
            </button>
            <button
              onClick={() => { setInputMethod("upload"); setError(null); }}
              className={`flex-1 py-3 text-center font-semibold text-xs uppercase tracking-wider border-b-2 flex items-center justify-center space-x-2 transition-all ${
                inputMethod === "upload"
                  ? "border-[#064e3b] text-[#064e3b] bg-white"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Unggah Audio</span>
            </button>
          </div>

          <div className="p-4 md:p-6">
            {/* RECORD CARD */}
            {inputMethod === "record" && (
              <div className="space-y-4">
                <div className="max-w-md mx-auto p-5 bg-stone-50/50 border border-stone-200 rounded-xl text-center">
                  {isRecording ? (
                    <div className="flex flex-col items-center gap-4 w-full">
                      <button
                        onClick={stopRecording}
                        className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md animate-pulse active:scale-95 transition-all"
                      >
                        <Square className="h-5 w-5" />
                      </button>
                      <div>
                        <span className="text-xs font-bold text-red-600 uppercase tracking-widest block mb-1">REKAMPAD AKTIF</span>
                        <div className="flex items-center justify-center space-x-1 h-8 w-full mb-2">
                          {vizHeights.map((h, i) => (
                            <span
                              key={i}
                              className="w-1 rounded-full bg-emerald-600 transition-all duration-150"
                              style={{ height: `${h / 2}px` }}
                            ></span>
                          ))}
                        </div>
                        <span className="text-2xl font-mono font-bold text-stone-800">{formatTime(recordTime)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 w-full">
                      <button
                        onClick={startRecording}
                        className="h-16 w-16 rounded-full bg-[#064e3b] hover:bg-emerald-900 text-white flex items-center justify-center shadow-md active:scale-95 transition-all"
                      >
                        <Mic className="h-6 w-6" />
                      </button>
                      <div>
                        <span className="text-xs font-bold text-stone-700 block">Klik tombol untuk mulai merekam</span>
                        <span className="text-[10px] text-stone-400 mt-0.5 block">Format rekam aman didukung di Android/iOS/PC</span>
                      </div>
                    </div>
                  )}

                  {/* Speech to text toggle */}
                  {!isRecording && (
                    <div className="mt-4 flex items-center gap-3 bg-white p-3 border border-stone-200 rounded-lg text-left w-full shadow-sm">
                      <input
                        type="checkbox"
                        id="use-realtime-speech-v2"
                        checked={useRealtimeSpeech}
                        onChange={(e) => setUseRealtimeSpeech(e.target.checked)}
                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-stone-300 rounded cursor-pointer"
                      />
                      <label htmlFor="use-realtime-speech-v2" className="text-xs text-stone-700 font-medium cursor-pointer select-none flex-1">
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

                  {(realtimeTranscript || interimTranscript) && (
                    <div className="mt-4 text-left bg-[#f4f7f6] border border-[#d1dbd8] rounded-lg p-3 w-full">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-[#064e3b] flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
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
                      <div className="text-xs font-mono text-stone-800 leading-relaxed max-h-32 overflow-y-auto bg-white p-2 border border-stone-200 rounded-md whitespace-pre-wrap">
                        {realtimeTranscript}
                        {interimTranscript && (
                          <span className="text-emerald-600 font-bold italic font-sans"> {interimTranscript}...</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* UPLOAD FILE CARD */}
            {inputMethod === "upload" && (
              <div className="space-y-4">
                <div className="max-w-md mx-auto">
                  <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-stone-300 rounded-xl bg-stone-50 hover:bg-stone-100/50 cursor-pointer transition-all p-4 text-center group">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="p-2.5 bg-white rounded-full shadow border border-stone-200 text-stone-500 group-hover:text-emerald-800 transition-all">
                        <Upload className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-semibold text-stone-700">
                        {selectedFile ? selectedFile.name : "Klik atau seret file audio kesini"}
                      </p>
                      <p className="text-[10px] text-stone-400">
                        Mendukung MP3, WAV, M4A, atau WebM (Maks. 25MB)
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

                  {selectedFile && (
                    <div className="mt-3 text-center">
                      <span className="text-xs bg-emerald-50 text-emerald-700 font-mono py-1 px-2.5 rounded-full border border-emerald-100 inline-block">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PROCESS TRIGGER */}
            <div className="mt-5 max-w-md mx-auto">
              <button
                onClick={handleProcessAudio}
                disabled={isProcessing || (inputMethod === "record" && !recordedBlob) || (inputMethod === "upload" && !selectedFile)}
                className="w-full bg-[#064e3b] hover:bg-emerald-900 text-white py-3 px-4 rounded-xl font-bold text-xs tracking-wider uppercase disabled:opacity-40 transition-all flex items-center justify-center space-x-2 shadow"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>SEDANG MEMBACA RAPAT...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>SUSUN NOTULENSI DINAS</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* LOADING BOX */}
        {isProcessing && (
          <div className="p-5 bg-white border border-stone-200 rounded-xl text-center space-y-3">
            <div className="relative mb-2 flex flex-col items-center">
              <div className="h-14 w-14 rounded-full border-4 border-stone-200 border-t-[#064e3b] animate-spin"></div>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold text-[#064e3b]">
                {progressPercent}%
              </span>
            </div>
            <h3 className="text-xs font-bold text-stone-800">Menyusun Notulensi Pengadilan Agama Paniai</h3>
            <div className="w-full max-w-xs bg-stone-200 h-2 rounded-full mx-auto overflow-hidden">
              <div className="bg-[#064e3b] h-full rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
            </div>
            <p className="text-[11px] text-stone-500 italic">"{progressMessage}"</p>
          </div>
        )}

        {/* ERROR DISPLAY */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-start space-x-2 max-w-md mx-auto">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Gagal Memproses Notulen</p>
              <p className="text-stone-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* SUCCESS OUTPUT */}
        {resultMarkdown && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="text-[11px] font-bold text-[#064e3b] uppercase tracking-wider flex items-center space-x-1.5">
                <Sparkles className="h-4 w-4" />
                <span>Dokumen Notulen Selesai Disusun!</span>
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 text-stone-700 bg-white border border-stone-200 rounded-lg text-[11px] font-semibold hover:bg-stone-50 shadow-sm flex items-center space-x-1"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-600">Disalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-stone-500" />
                      <span>Salin Hasil</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownloadTxt}
                  className="px-3 py-1.5 text-stone-700 bg-white border border-stone-200 rounded-lg text-[11px] font-semibold hover:bg-stone-50 shadow-sm flex items-center space-x-1"
                >
                  <Download className="h-3.5 w-3.5 text-stone-500" />
                  <span>Unduh Dokumen</span>
                </button>
              </div>
            </div>

            {/* PAPER PREVIEW */}
            <div className="bg-white shadow border border-stone-200 rounded-md p-6 md:p-10 font-serif text-stone-800 leading-relaxed max-w-2xl mx-auto">
              <div className="text-center border-b-2 border-stone-800 pb-3 mb-4">
                <h2 className="text-xs md:text-sm font-bold uppercase">MAHKAMAH AGUNG REPUBLIK INDONESIA</h2>
                <h3 className="text-[10px] md:text-xs font-bold uppercase mt-0.5">DIREKTORAT JENDERAL BADAN PERADILAN AGAMA</h3>
                <h3 className="text-[10px] md:text-xs font-bold uppercase mt-0.5">PENGADILAN TINGGI AGAMA JAYAPURA</h3>
                <h1 className="text-xs md:text-sm font-bold uppercase mt-0.5">PENGADILAN AGAMA PANIAI</h1>
                <p className="text-[9px] font-sans text-stone-500 italic mt-1">
                  Kompleks Kantor Bupati Paniai, Paniai Timur, Paniai, Telp. 085244544676
                </p>
                <p className="text-[9px] font-sans text-stone-500 italic">
                  www.pa-paniai.go.id, pengadilan.agama.paniai@gmail.com
                </p>
              </div>
              <div className="prose prose-stone max-w-none text-xs font-sans whitespace-pre-wrap leading-relaxed">
                {resultMarkdown}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-stone-900 text-stone-400 py-4 text-center text-[11px] mt-10 border-t border-stone-800">
        <p>© {new Date().getFullYear()} Pengadilan Agama Paniai. Hak Cipta Dilindungi.</p>
        <p className="text-stone-600 mt-0.5">Sistem Notulensi Otomatis didukung oleh Google Gemini</p>
      </footer>
    </div>
  );
}
