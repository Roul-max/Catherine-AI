"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { loadMessages, saveMessage } from "../src/lib/supabase";
import {
  Mic,
  Square,
  Loader2,
  Volume2,
  Settings,
  Trash2,
  Download,
  VolumeX,
  Lock,
  Unlock,
  AlertCircle,
  Activity
} from "lucide-react";
import ReactMarkdown from "react-markdown";

// We fallback if WEBHOOK_URL is not there
const WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || process.env.NEXT_PUBLIC_WEBHOOK_URL || "";

const SUGGESTIONS = [
  "Run system diagnostic",
  "Explain quantum computing",
  "Tell me a joke"
];

type Message = {
  id: string;
  role: "user" | "catherine";
  content: string;
  timestamp?: number;
  isNew?: boolean;
  recalled?: boolean;
};

type State = "idle" | "listening" | "processing" | "speaking";

type Metrics = {
  stt: number;
  n8n: number;
  tool: number;
  tts: number;
  total: number;
};

export default function Home() {
  return <HomeContent />;
}

function HomeContent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({ stt: 0, n8n: 0, tool: 0, tts: 0, total: 0 });
  const [volumeLevels, setVolumeLevels] = useState<number[]>(
    Array(10).fill(12),
  );
  
  const themeColor = "cyan";
  const visMode = "bars";
  const voiceId = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID || "pqHfZKP75CvOlQylNhV4";
  const playbackRate = 1;

  const [autoScroll, setAutoScroll] = useState(true);
  const [hapticPulse, setHapticPulse] = useState(false);
  const [sysStatus, setSysStatus] = useState<"ok" | "err" | "checking">("ok");

  // Ping mechanism
  useEffect(() => {
    const checkHealth = async () => {
      setSysStatus("checking");
      try {
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000));
        const req = fetch("/api/ping");
        
        const res = await Promise.race([req, timeout]) as Response;
        
        if (res.ok) setSysStatus("ok");
        else setSysStatus("err");
      } catch (err) {
        setSysStatus("err");
      }
    };
    
    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  // Hydrate memory on mount
  useEffect(() => {
     async function initMemory() {
        try {
           const history = await loadMessages("current_session");
           if (history && history.length > 0) {
              setMessages(history.map((row: any) => ({
                 id: row.id,
                 role: row.role as "user" | "catherine",
                 content: row.content,
                 timestamp: new Date(row.created_at).getTime(),
                 isNew: false
              })));
           } else {
              setMessages([{
                 id: "init",
                 role: "catherine",
                 content: "Catherine system online. How can I assist you today?",
                 timestamp: Date.now(),
                 isNew: false
              }]);
           }
        } catch(e: any) {
           setError("Failed to load memory: " + e.message);
           const stored = localStorage.getItem("catherine-messages");
           if (stored) {
              setMessages(JSON.parse(stored));
           } else {
              setMessages([{
                 id: "init",
                 role: "catherine",
                 content: "Catherine system online. How can I assist you today? (Memory disabled)",
                 timestamp: Date.now(),
                 isNew: false
              }]);
           }
        } finally {
           setIsLoaded(true);
        }
     }
     initMemory();
  }, []);

  // Periodic Auto-Save
  useEffect(() => {
    if (!isLoaded) return;
    const interval = setInterval(() => {
        localStorage.setItem("catherine-messages", JSON.stringify(messages));
    }, 30000);
    return () => clearInterval(interval);
  }, [isLoaded, messages]);
  
  const themeRgbMap = {
    cyan: "220, 240, 255", // Paler, more minimalist icy cyan
    amber: "245, 158, 11",
    purple: "168, 85, 247",
    lime: "132, 204, 22"
  };

  const voices = [
    { id: "pqHfZKP75CvOlQylNhV4", name: "Default (Bill)" },
    { id: "pNInz6obpgDQGcFmaJcg", name: "Adam" },
    { id: "ErXwobaYiN019PkySvjV", name: "Antoni" },
    { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella" },
    { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel" },
    { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi" },
  ];

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<State>("idle");

  useEffect(() => {
    stateRef.current = state;
    let int: NodeJS.Timeout;
    if (state === "speaking") {
      int = setInterval(() => {
         setVolumeLevels(Array(10).fill(0).map(() => 12 + Math.random() * 25));
      }, 50);
    } else if (state === "processing") {
      setVolumeLevels(Array(10).fill(12));
    }
    return () => clearInterval(int);
  }, [state]);

  function stopMicrophone() {
     if (microphoneStreamRef.current) {
        microphoneStreamRef.current.getTracks().forEach(track => track.stop());
        microphoneStreamRef.current = null;
     }
  }

  function stopAudio() {
    if (audioRef.current) {
       audioRef.current.pause();
       audioRef.current.currentTime = 0;
    }
    setState(prev => "idle");
  }

  const playAudio = async (text: string) => {
    try {
       const ttsStart = performance.now();
       setState("speaking");
       if (!audioRef.current) {
          audioRef.current = new Audio();
       }
       // Using the proxy endpoint to avoid CORS and pass headers safely while natively streaming
       const url = `/api/tts?text=${encodeURIComponent(text)}&voiceId=${voiceId}`;
       audioRef.current.src = url;
       audioRef.current.playbackRate = playbackRate;
       audioRef.current.muted = isMuted;
       audioRef.current.onended = () => {
          setState("idle");
       };
       audioRef.current.onerror = () => {
          console.error("TTS playback error");
          setState("idle");
       };
       await audioRef.current.play();
       setMetrics(m => ({ ...m, tts: performance.now() - ttsStart }));
    } catch(e) {
       console.error("TTS Error:", e);
       setState("idle");
    }
  };

  const sendCommand = async (cmd: string) => {
    if (!cmd.trim()) return;
    
    // Attempt saving to memory
    saveMessage("current_session", "user", cmd);

    const newMessage: Message = {
      id: Date.now().toString(),
      role: "user" as const,
      content: cmd,
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, newMessage]);
    setState("processing");
    
    // Prevent unconfigured webhook from throwing error
    if (!WEBHOOK_URL || WEBHOOK_URL === "YOUR_N8N_WEBHOOK_URL") {
        setCurrentTool(null);
        setError("Please configure the n8n webhook URL in your .env file");
        setState("idle");
        return;
    }

    try {
      const n8nStart = performance.now();
      const response = await fetch("/api/chat", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ query: cmd, webhookUrl: WEBHOOK_URL })
      });

      if (!response.ok) throw new Error("Webhook stream failed");
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let replyText = "";
      
      const replyMsgId = Date.now().toString() + "_r";
      const replyMsg: Message = {
         id: replyMsgId,
         role: "catherine" as const,
         content: "",
         timestamp: Date.now(),
         isNew: true,
         recalled: Math.random() > 0.7
      };
      setMessages(prev => [...prev, replyMsg]);
      let toolStart = 0;

      while (reader) {
         const { done, value } = await reader.read();
         if (done) break;
         const chunk = decoder.decode(value);
         
         const lines = chunk.split('\\n');
         for (const line of lines) {
            if (line.startsWith('data: ')) {
               const dataStr = line.slice(6);
               try {
                  const data = JSON.parse(dataStr);
                  if (data.type === 'tool_start') {
                     setCurrentTool(data.tool);
                     toolStart = performance.now();
                  } else if (data.type === 'tool_end') {
                     setCurrentTool(null);
                     if (toolStart) setMetrics(m => ({ ...m, tool: performance.now() - toolStart }));
                  } else if (data.type === 'token') {
                     replyText += data.text;
                     setMessages(prev => prev.map(m => m.id === replyMsgId ? { ...m, content: replyText } : m));
                  } else if (data.text) {
                     replyText += data.text;
                     setMessages(prev => prev.map(m => m.id === replyMsgId ? { ...m, content: replyText } : m));
                  }
               } catch(e) {
                  // Fallback for plain text streaming without SSE format
                  replyText += dataStr;
                  setMessages(prev => prev.map(m => m.id === replyMsgId ? { ...m, content: replyText } : m));
               }
            } else if (line.trim().length > 0 && !line.startsWith('event:')) {
                // Not standard SSE, maybe just plain text chunks from response
                replyText += line;
                setMessages(prev => prev.map(m => m.id === replyMsgId ? { ...m, content: replyText } : m));
            }
         }
      }
      
      const totalN8n = performance.now() - n8nStart;
      setMetrics(m => ({ ...m, n8n: totalN8n, total: Object.values(m).reduce((a,b)=>a+b,0) + totalN8n }));
      
      saveMessage("current_session", "catherine", replyText);
      await playAudio(replyText);
      
    } catch (e: any) {
      console.error(e);
      setCurrentTool(null);
      setError("Failed to connect to webhook.");
      setState("idle");
    }
  };

  const initSpeechRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser.");
      return null;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => {
       setState("listening");
    };
    
    recognition.onresult = (event: any) => {
       const text = event.results[0][0].transcript;
       if (text) {
          sendCommand(text);
       }
    };
    
    recognition.onerror = (event: any) => {
       if (event.error !== 'no-speech') {
         setError("Speech recognition error: " + event.error);
       }
       setState("idle");
       stopMicrophone();
    };

    recognition.onend = () => {
       if (stateRef.current === "listening") {
          setState("idle");
          stopMicrophone(); // Make sure to stop mic analysis
       }
    };
    
    return recognition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  useEffect(() => {
     recognitionRef.current = initSpeechRecognition();
  }, [initSpeechRecognition]);



  const startMicrophoneAnalysis = async () => {
     try {
       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
       microphoneStreamRef.current = stream;
       const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
       audioContextRef.current = audioCtx;
       const analyser = audioCtx.createAnalyser();
       analyser.fftSize = 256;
       const source = audioCtx.createMediaStreamSource(stream);
       source.connect(analyser);
       analyserRef.current = analyser;
     } catch (err: any) {
       setError("Microphone access denied: " + err.message);
     }
  };

  const toggleRecording = async () => {
    if (state === "listening") {
      recognitionRef.current?.stop();
    } else if (state === "speaking") {
      stopAudio();
    } else {
      setError(null);
      await startMicrophoneAnalysis();
      try {
         recognitionRef.current?.start();
      } catch (e) {
         console.error(e);
      }
    }
  };

  // Global Keyboard Shortcut for Spacebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const activeTag = document.activeElement?.tagName;
        if (
          activeTag !== "INPUT" &&
          activeTag !== "TEXTAREA" &&
          activeTag !== "SELECT"
        ) {
          e.preventDefault();
          setHapticPulse(true);
          setTimeout(() => setHapticPulse(false), 200);
          toggleRecording();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Update volume when muted
  useEffect(() => {
    if (audioRef.current) {
       audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Audio Visualization loop
  useEffect(() => {
    let raf: number;
    let timeoutId: any;

    if (state === "speaking" || state === "listening") {
      const updateWaveform = () => {
        let dataArray = new Uint8Array(10);
        
        if (state === "listening" && analyserRef.current) {
           const bufferLength = analyserRef.current.frequencyBinCount;
           const fullDataArray = new Uint8Array(bufferLength);
           analyserRef.current.getByteFrequencyData(fullDataArray);
           
           const step = Math.floor(bufferLength / 10);
           for (let i = 0; i < 10; i++) {
             let sum = 0;
             for (let j = 0; j < step; j++) {
               sum += fullDataArray[i * step + j] || 0;
             }
             const avg = sum / step;
             dataArray[i] = avg;
           }
        } else if (state === "speaking") {
           for (let i = 0; i < 10; i++) {
              dataArray[i] = Math.random() * 255; 
           }
        }
        
        const bars = [];
        for (let i = 0; i < 10; i++) {
          bars.push(12 + (dataArray[i] / 255) * 33);
        }
        
        setVolumeLevels(bars);
        
        if (state === "speaking") {
           timeoutId = setTimeout(() => {
              raf = requestAnimationFrame(updateWaveform);
           }, 50);
        } else {
           raf = requestAnimationFrame(updateWaveform);
        }
      };
      updateWaveform();
    } else {
      setVolumeLevels(Array(10).fill(12));
    }

    return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timeoutId);
    }
  }, [state, visMode]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, state, autoScroll]);

  const createNewSession = () => {
      const initialMessage: Message = {
        id: Date.now().toString() + "_init",
        role: "catherine",
        content: "Hello, I'm Catherine. How can I assist you today?",
        timestamp: Date.now(),
        isNew: true
      };
      setMessages([initialMessage]);
  };

  // Load from localStorage
  useEffect(() => {
    const savedMessages = localStorage.getItem("catherine-messages");
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        if (parsed.length > 0) {
           setMessages(parsed);
        } else {
           createNewSession();
        }
      } catch (e) { createNewSession(); }
    } else {
       createNewSession();
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when messages change
  useEffect(() => {
    if (isLoaded && messages.length > 0) {
       localStorage.setItem("catherine-messages", JSON.stringify(messages));
    }
  }, [messages, isLoaded]);

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div 
      className="flex h-screen w-full bg-[#030303] text-[#e5e5e5] font-sans overflow-hidden relative"
      style={{
         "--accent-rgb": themeRgbMap[themeColor],
         "--accent": `rgb(${themeRgbMap[themeColor]})`,
         "--accent-20": `rgba(${themeRgbMap[themeColor]}, 0.2)`,
         "--accent-60": `rgba(${themeRgbMap[themeColor]}, 0.6)`,
         "--accent-80": `rgba(${themeRgbMap[themeColor]}, 0.8)`,
         "--accent-10": `rgba(${themeRgbMap[themeColor]}, 0.1)`,
         "--accent-5": `rgba(${themeRgbMap[themeColor]}, 0.05)`,
         "--accent-30": `rgba(${themeRgbMap[themeColor]}, 0.3)`,
         "--accent-40": `rgba(${themeRgbMap[themeColor]}, 0.4)`,
         "--accent-50": `rgba(${themeRgbMap[themeColor]}, 0.5)`,
      } as React.CSSProperties}
    >
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#020202] to-[#050505] pointer-events-none" />

      {/* MAIN VIEW */}
      <main className="flex-1 flex flex-col relative py-6 md:py-10">
        <header className="px-6 md:px-10 flex justify-center items-center shrink-0 z-10 p-4 mix-blend-screen opacity-50 hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-2">
            <Mic className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="text-xs font-mono tracking-widest text-white/50 uppercase">Catherine Agent</span>
          </div>
        </header>

        <div
          className="flex-1 flex flex-col overflow-y-auto px-6 md:px-10 mask-image-fade relative z-10"
          style={{ scrollBehavior: "smooth" }}
        >
          <div className="w-full max-w-[700px] mx-auto flex flex-col gap-8 pb-20 mt-auto">
            {messages.length === 1 && state === "idle" && (
              <div className="flex flex-col items-center justify-center gap-6 mt-10">
                 <p className="font-mono text-xs tracking-widest text-[var(--accent)] uppercase text-center opacity-60">
                   Suggested Commands
                 </p>
                 <div className="flex gap-3 flex-wrap justify-center max-w-md">
                   {SUGGESTIONS.map((cmd) => (
                      <button 
                        key={cmd}
                        onClick={() => sendCommand(cmd)}
                        className="px-4 py-2 bg-white/[0.03] border border-white/5 rounded-full text-xs text-white/70 hover:text-[var(--accent)] hover:border-[var(--accent-30)] hover:bg-[var(--accent-10)] transition-colors"
                      >
                         {cmd}
                      </button>
                   ))}
                 </div>
              </div>
            )}

            {messages.map((msg) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                whileHover={{ scale: 1.01, x: msg.role === "user" ? -5 : 5 }}
                style={{
                  transformOrigin:
                    msg.role === "user" ? "right center" : "left center",
                }}
                key={msg.id}
                className={`flex w-full ${msg.role === "user" ? "justify-end text-right" : "justify-start"} transition-all`}
              >
                <div className="flex flex-col max-w-[85%] relative z-10 hidden-scrollbar">
                  <span className="text-[10px] uppercase tracking-[2px] text-white/40 mb-2">
                    {msg.role === "user" ? "User Input" : "Catherine Response"}
                  </span>
                  <div
                    className={`text-sm leading-[1.7] backdrop-blur-2xl
                             ${
                               msg.role === "catherine"
                                 ? "text-white p-5 bg-gradient-to-b from-[#111111]/90 to-[#050505]/90 rounded-2xl rounded-tl-sm border border-[var(--accent-20)] shadow-[0_8px_32px_-12px_var(--accent-10)]"
                                 : "text-white/90 py-3 px-5 bg-white/[0.04] rounded-2xl rounded-tr-sm border border-white/[0.08] shadow-lg"
                             }`}
                  >
                    {msg.role === "catherine" ? (
                      <div className="flex flex-col gap-2">
                        {msg.recalled && (
                          <div className="flex items-center gap-1.5 opacity-60 self-start">
                             <div className="w-1 h-1 rounded-full bg-[var(--accent)] shadow-[0_0_5px_var(--accent-50)]" />
                             <span className="text-[9px] font-mono tracking-widest uppercase text-[var(--accent)]">
                               Memory Recalled
                             </span>
                          </div>
                        )}
                        <div className="markdown-body text-white">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                  <div className="flex gap-4 justify-between mt-2">
                    {msg.timestamp && (
                      <span
                        className={`text-[10px] text-white/30 font-mono ${msg.role === "user" ? "text-right w-full" : ""}`}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    )}
                    {msg.role === "catherine" && msg.isNew && process.env.NODE_ENV === "development" && (
                       <span className="text-[9px] text-white/20 font-mono tracking-widest uppercase flex gap-2">
                          <span title="STT Latency">STT: {(metrics.stt).toFixed(0)}ms</span>
                          | <span title="n8n Stream Latency">N8N: {(metrics.n8n).toFixed(0)}ms</span>
                          | <span title="Tool Exec Latency">TOOL: {(metrics.tool).toFixed(0)}ms</span>
                          | <span title="TTS Generation Latency">TTS: {(metrics.tts).toFixed(0)}ms</span>
                          | <span title="Total response latency" className="text-[var(--accent)] font-bold">TOTAL: {(metrics.total).toFixed(0)}ms</span>
                       </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}

            {state === "processing" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full justify-start"
              >
                <div className="flex flex-col max-w-[85%] relative z-10">
                  <span className="text-[10px] uppercase tracking-[2px] text-white/40 mb-2">
                    Catherine is typing...
                  </span>
                  <div className="text-sm text-white p-5 bg-gradient-to-b from-[#111111]/90 to-[#050505]/90 rounded-2xl rounded-tl-sm border border-[var(--accent-20)] shadow-[0_8px_32px_-12px_var(--accent-10)] flex items-center justify-center min-w-[80px] h-[52px] backdrop-blur-2xl overflow-hidden relative">
                    <svg width="100%" height="100%" viewBox="0 0 60 20" className="absolute inset-0 m-auto opacity-70">
                      <motion.path
                        d="M 0 10 Q 15 0 30 10 T 60 10"
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        initial={{ d: "M 0 10 Q 15 0 30 10 T 60 10" }}
                        animate={{
                          d: [
                            "M 0 10 Q 15 0 30 10 T 60 10",
                            "M 0 10 Q 15 20 30 10 T 60 10",
                            "M 0 10 Q 15 0 30 10 T 60 10"
                          ]
                        }}
                        transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                      />
                      <motion.path
                        d="M 0 10 Q 15 20 30 10 T 60 10"
                        fill="none"
                        stroke="var(--accent-60)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        initial={{ d: "M 0 10 Q 15 20 30 10 T 60 10" }}
                        animate={{
                          d: [
                            "M 0 10 Q 15 20 30 10 T 60 10",
                            "M 0 10 Q 15 0 30 10 T 60 10",
                            "M 0 10 Q 15 20 30 10 T 60 10"
                          ]
                        }}
                        transition={{ repeat: Infinity, duration: 0.9, ease: "easeInOut", delay: 0.2 }}
                      />
                    </svg>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0 flex items-center justify-center opacity-40 mix-blend-screen transition-opacity duration-1000">
          <VoiceCore state={state} />
        </div>

        <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 z-30 flex flex-col items-center gap-4 w-full px-4 max-w-[800px]">
          {/* Status Indicator Above Command Bar */}
          <AnimatePresence>
             {currentTool && (
                <motion.div
                   initial={{ opacity: 0, y: 10, scale: 0.95 }}
                   animate={{ opacity: 1, y: 0, scale: 1 }}
                   exit={{ opacity: 0, y: -10, scale: 0.9 }}
                   className="absolute -top-12 bg-[#050505]/95 backdrop-blur-2xl border border-[var(--accent-30)] px-4 py-1.5 rounded-full flex items-center gap-2 shadow-[0_0_20px_var(--accent-10)]"
                >
                   <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                   <span className="text-[10px] font-mono tracking-[0.1em] text-[var(--accent)] uppercase">{currentTool}</span>
                </motion.div>
             )}
          </AnimatePresence>

          <div className="flex items-center gap-4 bg-[#080808]/90 backdrop-blur-3xl border border-white/5 p-3 rounded-[40px] shadow-[0_8px_32px_rgba(0,0,0,0.8)] w-full relative">
            
            <div className="hidden md:flex w-[100px] justify-center items-center px-2 shrink-0">
              <AnimatePresence mode="wait">
                {error ? (
                  <motion.p
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-red-400 text-[9px] font-mono tracking-widest max-w-[120px] overflow-hidden truncate"
                    title={error}
                  >
                    {error.length > 15 ? error.slice(0, 15) + "..." : error}
                  </motion.p>
                ) : state === "speaking" || state === "listening" ? (
                  <motion.div
                    key="waveform"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-[2px] h-6"
                  >
                    {state === "listening"
                      ? Array.from({ length: 10 }).map((_, i) => (
                          <motion.div
                            key={`l-${i}`}
                            animate={{
                              height: [6, 12 + (i % 3) * 4, 6],
                            }}
                            transition={{
                              repeat: Infinity,
                              duration: 0.5 + (i % 4) * 0.1,
                            }}
                            className="w-[2px] bg-[#ef4444] rounded-full opacity-80"
                          />
                        ))
                      : volumeLevels.map((h, i) => (
                          <motion.div
                            key={`s-${i}`}
                            animate={{ height: h/2 }}
                            transition={{ type: "tween", duration: 0.05 }}
                            className="w-[3px] mx-[1px] bg-[var(--accent)] rounded-full opacity-100 shadow-[0_0_8px_var(--accent-50)]"
                          />
                        ))}
                  </motion.div>
                ) : state === "processing" ? (
                  <motion.p
                    key="processing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-[var(--accent)] text-[9px] font-mono tracking-widest uppercase"
                  >
                    Processing
                  </motion.p>
                ) : (
                  <motion.p 
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-white/30 text-[9px] font-mono tracking-[0.2em] uppercase"
                  >
                    SYS.IDLE
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <form 
               onSubmit={(e) => { e.preventDefault(); const form = e.target as HTMLFormElement; const input = form.elements.namedItem('q') as HTMLInputElement; const t = input.value; if(t) sendCommand(t); form.reset(); }}
               className="flex-1 flex items-center bg-white/[0.02] hover:bg-white/[0.04] transition-colors rounded-full px-6 h-[56px] border border-white/10 group focus-within:border-[var(--accent-40)] focus-within:bg-white/[0.05]"
            >
               <input 
                  name="q"
                  type="text"
                  placeholder="Message Catherine..."
                  className="bg-transparent border-none outline-none text-[15px] p-2 text-white w-full placeholder-white/30"
                  autoComplete="off"
               />
               <button type="submit" className="hidden"></button>
            </form>

            <button
              onClick={toggleRecording}
              className={`relative flex items-center justify-center w-[64px] h-[64px] rounded-full shrink-0 focus:outline-none transition-all duration-300 shadow-[0_0_30px_var(--accent-20)]
                    ${
                      state === "listening"
                        ? "bg-[#ef4444] shadow-[0_0_30px_rgba(239,68,68,0.5)] text-white scale-110"
                        : "bg-gradient-to-tr from-[var(--accent)] to-[var(--accent-80)] hover:scale-105 active:scale-95 text-[#030303]"
                    } ${hapticPulse ? "scale-90 brightness-150" : ""}`}
            >
              {state === "idle" || state === "speaking" ? (
                <Mic className="w-6 h-6" strokeWidth={2.5} />
              ) : state === "listening" ? (
                <Square className="w-5 h-5 outline-none" fill="currentColor" />
              ) : (
                <Loader2 className="w-6 h-6 animate-spin" />
              )}
            </button>
            
          </div>
          <div className="flex items-center gap-1.5 opacity-60">
             <div className={`w-1.5 h-1.5 rounded-full ${sysStatus === 'ok' ? 'bg-[var(--accent)] shadow-[0_0_5px_var(--accent-50)]' : sysStatus === 'checking' ? 'bg-amber-400 animate-pulse' : 'bg-red-500 shadow-[0_0_5px_#ef4444]'}`} />
             <span className="text-[8px] font-mono tracking-widest uppercase text-white/50">
               {sysStatus === 'ok' ? 'API_ONLINE' : sysStatus === 'checking' ? 'PINGING...' : 'API_ERR'}
             </span>
          </div>
          <div className="flex items-center gap-1.5 opacity-60 ml-3">
             <div className={`w-1.5 h-1.5 rounded-full ${state !== 'idle' ? 'bg-cyan-400 shadow-[0_0_5px_#22d3ee]' : 'bg-red-500 shadow-[0_0_5px_#ef4444]'}`} />
             <span className="text-[8px] font-mono tracking-widest uppercase text-white/50">
               {state !== 'idle' ? 'CORE_ACTIVE' : 'CORE_IDLE'}
             </span>
          </div>
        </div>
      </main>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .mask-image-fade {
           mask-image: linear-gradient(to bottom, transparent, black 10%, black 100%, black);
           -webkit-mask-image: linear-gradient(to bottom, transparent, black 10%, black 100%, black);
        }
        .hidden-scrollbar::-webkit-scrollbar {
           display: none;
        }
        .hidden-scrollbar {
           -ms-overflow-style: none;
           scrollbar-width: none;
        }
      `
        }}
      />
    </div>
  );
}

const VoiceCore = memo(function VoiceCore({ state }: { state: State }) {
  const isListening = state === "listening";
  const isSpeaking = state === "speaking";
  const isProcessing = state === "processing";

  return (
    <div className="relative flex items-center justify-center w-[300px] h-[300px] pointer-events-none">
       {/* Ambient Glow */}
       <motion.div
         animate={{
           scale: isListening ? 1.4 : isSpeaking ? [1, 1.2, 1] : isProcessing ? [0.9, 1.1, 0.9] : 1,
           opacity: isSpeaking ? [0.3, 0.6, 0.3] : isListening ? 0.6 : isProcessing ? [0.2, 0.5, 0.2] : 0.1
         }}
         transition={{
           repeat: (isSpeaking || isProcessing) ? Infinity : 0,
           duration: isProcessing ? 2 : 0.8,
           ease: "easeInOut"
         }}
         className="absolute w-[200px] h-[200px] rounded-full bg-[var(--accent)] blur-[100px]"
       />
       {/* Orb Base */}
       <motion.div
           animate={{
               scale: isSpeaking ? [0.95, 1.05, 0.95] : isListening ? 1.05 : 1
           }}
           transition={{
               repeat: isSpeaking ? Infinity : 0,
               duration: 0.15,
               ease: "linear"
           }}
           className="w-[120px] h-[120px] rounded-full border border-[var(--accent-20)] bg-[#030303]/60 backdrop-blur-xl shadow-[inset_0_0_30px_var(--accent-10)] flex items-center justify-center relative overflow-hidden"
       >
          <div className={`absolute inset-0 bg-gradient-to-tr from-[var(--accent-10)] to-transparent transition-opacity duration-500 ${state !== 'idle' ? 'opacity-100' : 'opacity-0'}`} />
          <div className={`w-[40px] h-[40px] rounded-full bg-[var(--accent)] transition-all duration-300 ${state !== 'idle' ? 'blur-[15px] opacity-80' : 'blur-[25px] opacity-30'} ${isSpeaking ? 'animate-pulse' : ''}`} />
       </motion.div>
    </div>
  );
});
