"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { loadMessages, saveMessage, deleteMessage, clearConversation, clearAllConversations } from "../src/lib/supabase";
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
  Activity,
  Menu,
  Plus,
  X,
  Sliders,
  MessageSquare,
  Copy,
  Check,
  Search,
  Moon,
  Sun
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

type State = "idle" | "sleeping" | "listening" | "processing" | "speaking";

type Metrics = {
  stt: number;
  n8n: number;
  tool: number;
  tts: number;
  total: number;
};

type SettingsConf = {
  wakeWord: string;
  speechRate: number;
  handsFree: boolean;
  autoSpeak: boolean;
  wakeTimeout: number;
  wakeMode: "beep" | "tts";
  wakeAcknowledge: string;
  theme: "dark" | "light";
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
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

  const [settings, setSettings] = useState<SettingsConf>({
    wakeWord: "Catherine",
    speechRate: 1,
    handsFree: false,
    autoSpeak: true,
    wakeTimeout: 5,
    wakeMode: "tts",
    wakeAcknowledge: "Yes?",
    theme: "dark",
  });
  const settingsRef = useRef(settings);
  
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("default");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sessionSearch, setSessionSearch] = useState("");
  
  const themeColor = "cyan";
  const visMode = "bars";

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

  // Load settings from local storage
  useEffect(() => {
    const savedSettings = localStorage.getItem("catherine-settings");
    if (savedSettings) {
      try { setSettings(prev => ({ ...prev, ...JSON.parse(savedSettings) })); } catch(e) {}
    }
  }, []);

  // Keep settings ref synced for event listeners
  useEffect(() => {
    settingsRef.current = settings;
    localStorage.setItem("catherine-settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (settings.theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  }, [settings.theme]);

  // Load sessions from local storage
  useEffect(() => {
    const storedSessions = localStorage.getItem("catherine-sessions");
    if (storedSessions) {
      setSessions(JSON.parse(storedSessions));
    } else {
      const initialSession = { id: "default", title: "New Conversation", updatedAt: Date.now() };
      setSessions([initialSession]);
      localStorage.setItem("catherine-sessions", JSON.stringify([initialSession]));
    }
  }, []);

  useEffect(() => {
    if (sessions.length > 0) localStorage.setItem("catherine-sessions", JSON.stringify(sessions));
  }, [sessions]);

  // Hydrate memory on mount
  useEffect(() => {
     async function initMemory() {
        try {
           const history = await loadMessages(currentSessionId);
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
           const stored = localStorage.getItem(`catherine-messages-${currentSessionId}`);
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
  }, [currentSessionId]);

  // Periodic Auto-Save
  useEffect(() => {
    if (!isLoaded) return;
    const interval = setInterval(() => {
        localStorage.setItem(`catherine-messages-${currentSessionId}`, JSON.stringify(messages));
    }, 30000);
    return () => clearInterval(interval);
  }, [isLoaded, messages, currentSessionId]);
  
  const themeRgbMap = {
    cyan: "220, 240, 255", // Paler, more minimalist icy cyan
    amber: "245, 158, 11",
    purple: "168, 85, 247",
    lime: "132, 204, 22"
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<State>("idle");
  const isRecognizingRef = useRef(false);
  const listeningTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const safeStartRecognition = useCallback(() => {
    if (!isRecognizingRef.current && recognitionRef.current) {
      try { recognitionRef.current.start(); } catch(e) {}
    }
  }, []);

  function stopMicrophone() {
     if (microphoneStreamRef.current) {
        microphoneStreamRef.current.getTracks().forEach(track => track.stop());
        microphoneStreamRef.current = null;
     }
  }

  function stopAudio() {
    if (audioRef.current) {
       audioRef.current.onended = null;
       audioRef.current.pause();
       audioRef.current.currentTime = 0;
    }
    window.speechSynthesis?.cancel();
    setState(settingsRef.current.handsFree ? "sleeping" : "idle");
    if (settingsRef.current.handsFree) {
       setTimeout(safeStartRecognition, 100);
    }
  }

  const playAudio = async (text: string, onComplete?: () => void) => {
    if (!settingsRef.current.autoSpeak) return onComplete?.();
    try {
       const ttsStart = performance.now();
       setState("speaking");
       try { recognitionRef.current?.stop(); } catch(e){} // Explicitly stop STT to prevent hearing itself
       
       const url = `/api/tts?text=${encodeURIComponent(text)}`;

       const audioResponse = await fetch(url);
       const audioBlob = await audioResponse.blob();
       const audioUrl = URL.createObjectURL(audioBlob);

       if (!audioRef.current) {
         audioRef.current = new Audio();
       }

       audioRef.current.src = audioUrl;
       audioRef.current.playbackRate = settingsRef.current.speechRate;
       audioRef.current.muted = isMuted;
       audioRef.current.onended = () => {
          if (onComplete) {
             onComplete();
          } else {
             setState(settingsRef.current.handsFree ? "sleeping" : "idle");
             if (settingsRef.current.handsFree) {
                setTimeout(safeStartRecognition, 100);
             }
          }
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

  const playWakeSound = () => {
    try {
      const ctx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch(e) {}
  };

  const sendCommand = async (cmd: string) => {
    if (!cmd.trim()) return;
    
    // Attempt saving to memory
    saveMessage(currentSessionId, "user", cmd);

    // Update session title if it's new
    if (messages.length <= 1) {
        setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, title: cmd.slice(0, 30) + "..." } : s));
    }

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
                  } else if (data.output) {
                     replyText += data.output;
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
                
                let displayContent = replyText;
                try {
                   const parsed = JSON.parse(replyText);
                   if (parsed && parsed.output) displayContent = parsed.output;
                } catch(err) {
                   const match = replyText.match(/"output"\s*:\s*"([^"]*)/);
                   if (match) displayContent = match[1].replace(/\\n/g, '\n');
                }
                
                setMessages(prev => prev.map(m => m.id === replyMsgId ? { ...m, content: displayContent } : m));
            }
         }
      }
      
      // Final extraction to ensure saved memory and TTS audio only use the extracted text
      try {
         const parsed = JSON.parse(replyText);
         if (parsed && parsed.output) {
            replyText = parsed.output;
            setMessages(prev => prev.map(m => m.id === replyMsgId ? { ...m, content: replyText } : m));
         }
      } catch(err) {}
      
      const totalN8n = performance.now() - n8nStart;
      setMetrics(m => ({ ...m, n8n: totalN8n, total: Object.values(m).reduce((a,b)=>a+b,0) + totalN8n }));
      
      saveMessage(currentSessionId, "catherine", replyText);
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
    recognition.continuous = false; // Wait for silence
    recognition.interimResults = false; // Only finalize full phrases
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => {
       isRecognizingRef.current = true;
       if (stateRef.current !== "sleeping") {
          setState("listening");
       }
    };
    
    recognition.onresult = (event: any) => {
       const text = event.results[0][0].transcript.trim();
       const lowerText = text.toLowerCase();
       const wakeWord = settingsRef.current.wakeWord.toLowerCase();

       if (lowerText === `${wakeWord} stop` || lowerText === "stop") {
           stopAudio();
           return;
       }

       if (stateRef.current === "sleeping") {
           if (lowerText.startsWith(wakeWord) || lowerText.includes(wakeWord)) {
               // Extract everything after the wake word (naturally ignores "Hey", "Ok", etc.)
               let command = text.substring(lowerText.indexOf(wakeWord) + wakeWord.length).trim();
               // Remove leading punctuation often added by STT (e.g. "Catherine, what's..." -> "what's...")
               command = command.replace(/^[,.?!-]+\s*/, '');
               
               if (command.length > 0) {
                   // One-shot mode: "Hey Catherine, what is the weather"
                   if (settingsRef.current.wakeMode === "beep") playWakeSound();
                   sendCommand(command);
               } else {
                   // Two-step mode: "Catherine" ... (wait for "Yes?")
                   if (settingsRef.current.wakeMode === "tts") {
                       setState("processing"); // Pause listening state
                       try { recognitionRef.current?.stop(); } catch(e){}
                       playAudio(settingsRef.current.wakeAcknowledge, () => {
                           setState("listening");
                           setTimeout(safeStartRecognition, 100);
                       });
                   } else {
                       playWakeSound();
                       setState("listening");
                   }
               }
           }
           return;
       }

       if (stateRef.current === "listening") {
           if (text) sendCommand(text);
       }
    };
    
    recognition.onerror = (event: any) => {
       isRecognizingRef.current = false;
       if (event.error !== 'no-speech') {
         setError("Speech recognition error: " + event.error);
       }
       setState("idle");
       stopMicrophone();
    };

    recognition.onend = () => {
       isRecognizingRef.current = false;
       if (settingsRef.current.handsFree) {
           if (stateRef.current === "sleeping" || stateRef.current === "listening") {
               setTimeout(safeStartRecognition, 100);
           }
       } else {
           if (stateRef.current === "listening") setState("idle");
           stopMicrophone();
       }
    };
    
    return recognition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeStartRecognition]); 

  useEffect(() => {
     const rec = initSpeechRecognition();
     recognitionRef.current = rec;
     return () => {
         if (rec) {
             rec.onstart = null;
             rec.onend = null;
             rec.onresult = null;
             rec.abort();
         }
     }
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
    if (settings.handsFree) return; // Prevent manual override while hands free is active

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

  useEffect(() => {
    if (settings.handsFree) {
       setState("sleeping");
       setTimeout(safeStartRecognition, 100);
    } else {
       setState("idle");
       try { recognitionRef.current?.stop(); } catch(e){}
    }
  }, [settings.handsFree, safeStartRecognition]);

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
        content: `Hello, I'm ${settingsRef.current.wakeWord}. How can I assist you today?`,
        timestamp: Date.now(),
        isNew: true
      };
      setMessages([initialMessage]);
      const newSessionId = "session_" + Date.now();
      setCurrentSessionId(newSessionId);
      setSessions(prev => [{ id: newSessionId, title: "New Conversation", updatedAt: Date.now() }, ...prev]);
  };

  const handleDeleteMessage = async (id: string) => {
      if (!confirm("Delete this message?")) return;
      setMessages(prev => prev.filter(m => m.id !== id));
      await deleteMessage(id);
      const saved = JSON.parse(localStorage.getItem(`catherine-messages-${currentSessionId}`) || "[]");
      localStorage.setItem(`catherine-messages-${currentSessionId}`, JSON.stringify(saved.filter((m: any) => m.id !== id)));
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm("Delete this conversation?")) return;
      await clearConversation(id);
      localStorage.removeItem(`catherine-messages-${id}`);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) createNewSession();
  };

  const handleClearAll = () => {
      if (!confirm("Clear current conversation?")) return;
      setMessages([]);
      clearConversation(currentSessionId);
      localStorage.removeItem(`catherine-messages-${currentSessionId}`);
      createNewSession();
  };

  const handleClearAllSessions = async () => {
      if (!confirm("WARNING: This will permanently delete ALL conversations. Proceed?")) return;
      setMessages([]);
      setSessions([]);
      
      // Clear local storage
      const keys = Object.keys(localStorage);
      keys.forEach(k => {
          if (k.startsWith("catherine-messages-")) {
              localStorage.removeItem(k);
          }
      });
      localStorage.removeItem("catherine-sessions");
      
      const sessionIds = sessions.map(s => s.id);
      if (sessionIds.length > 0) {
         await clearAllConversations(sessionIds);
      }
      
      createNewSession();
  };

  const handleExport = () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(messages, null, 2));
      const node = document.createElement('a');
      node.setAttribute("href", dataStr);
      node.setAttribute("download", "catherine_chat_history.json");
      document.body.appendChild(node);
      node.click();
      node.remove();
  };

  const handleCopy = (id: string, content: string) => {
      navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredSessions = sessions.filter(s => s.title.toLowerCase().includes(sessionSearch.toLowerCase()));

  const getStatusDisplay = () => {
      switch(state) {
          case "sleeping": return { label: "SLEEPING", color: "bg-red-500/50 text-red-500" };
          case "listening": return { label: "LISTENING", color: "bg-amber-400 text-amber-400" };
          case "processing": return { label: "THINKING", color: "bg-cyan-400 text-cyan-400" };
          case "speaking": return { label: "SPEAKING", color: "bg-green-400 text-green-400" };
          default: return { label: "IDLE", color: "bg-white/20 text-white/50" };
      }
  };
  const status = getStatusDisplay();

  return (
    <div 
      className="flex h-screen w-full bg-[var(--bg-main)] text-[var(--text-main)] font-sans overflow-hidden relative transition-colors duration-300"
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
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-[var(--bg-main)] to-[var(--bg-surface)] pointer-events-none opacity-50" />

      {/* SIDEBAR */}
      <div className={`absolute md:relative z-40 h-full bg-[var(--bg-surface)] border-r border-[var(--border-color)] transition-all duration-300 overflow-hidden flex flex-col shadow-2xl md:shadow-none ${isSidebarOpen ? "w-[280px] translate-x-0" : "w-0 -translate-x-full md:w-0 md:translate-x-0"}`}>
         <div className="p-4 flex items-center justify-between border-b border-[var(--border-color)] shrink-0">
            <span className="text-xs font-mono tracking-widest text-[var(--text-muted)] uppercase">Sessions</span>
               <div className="flex items-center gap-2">
                  <button onClick={handleClearAllSessions} aria-label="Delete All Sessions" className="text-red-400/50 hover:text-red-400 transition-colors" title="Delete All Sessions"><Trash2 className="w-4 h-4" /></button>
                  <button onClick={() => setIsSidebarOpen(false)} aria-label="Close Sidebar" className="md:hidden text-[var(--text-muted)] hover:text-[var(--text-main)]"><X className="w-4 h-4" /></button>
               </div>
         </div>
         <div className="p-3 border-b border-[var(--border-color)]">
            <div className="relative mb-3">
               <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
               <input type="text" placeholder="Search chats..." value={sessionSearch} onChange={e => setSessionSearch(e.target.value)} className="w-full bg-[var(--bg-surface-hover)] border border-[var(--border-color)] rounded-lg py-2 pl-9 pr-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-50)] transition-colors" aria-label="Search chats" />
            </div>
            <button onClick={createNewSession} aria-label="New Chat" className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--accent-10)] text-[var(--accent)] border border-[var(--border-color)] hover:border-[var(--accent-30)] transition-all text-xs font-mono uppercase tracking-widest shadow-sm focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
               <Plus className="w-3.5 h-3.5" /> New Chat
            </button>
         </div>
         <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
            {filteredSessions.map(s => (
               <div 
                  key={s.id} 
                  onClick={() => { setCurrentSessionId(s.id); setIsSidebarOpen(false); }}
                  className={`w-full text-left p-3 rounded-lg cursor-pointer group flex items-center justify-between transition-all ${currentSessionId === s.id ? "bg-[var(--accent-10)] border border-[var(--accent-30)] text-[var(--accent)] shadow-sm" : "bg-transparent border border-transparent hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)]"}`}
               >
                  <div className="flex items-center gap-3 overflow-hidden">
                     <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" />
                     <span className="text-sm truncate">{s.title}</span>
                  </div>
                  <button onClick={(e) => handleDeleteSession(s.id, e)} aria-label="Delete Session" className="opacity-0 group-hover:opacity-100 text-red-400/50 hover:text-red-400 transition-opacity p-1"><Trash2 className="w-3.5 h-3.5" /></button>
               </div>
            ))}
         </div>
      </div>

      {/* SETTINGS MODAL */}
      <AnimatePresence>
         {isSettingsOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
               <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                  <div className="p-5 flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-surface)]">
                     <h2 className="text-sm font-mono tracking-widest uppercase text-[var(--accent)]">System Config</h2>
                     <button onClick={() => setIsSettingsOpen(false)} aria-label="Close Settings" className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="p-6 flex flex-col gap-8 overflow-y-auto max-h-[70vh]">
                     
                     {/* Appearance */}
                     <section className="flex flex-col gap-4">
                        <h3 className="text-[10px] font-mono tracking-widest text-[var(--accent)] uppercase flex items-center gap-2"><Sun className="w-3 h-3" /> Appearance</h3>
                        <div className="flex items-center justify-between bg-[var(--bg-surface-hover)] p-3 rounded-lg border border-[var(--border-color)]">
                           <span className="text-sm text-[var(--text-main)]">Theme Mode</span>
                           <button onClick={() => setSettings({...settings, theme: settings.theme === 'dark' ? 'light' : 'dark'})} className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-md text-sm hover:border-[var(--accent-50)] transition-all">
                              {settings.theme === 'dark' ? <Moon className="w-4 h-4 text-[var(--accent)]" /> : <Sun className="w-4 h-4 text-[var(--accent)]" />}
                              {settings.theme === 'dark' ? 'Dark' : 'Light'}
                           </button>
                        </div>
                     </section>

                     {/* Voice & Audio */}
                     <section className="flex flex-col gap-4">
                        <h3 className="text-[10px] font-mono tracking-widest text-[var(--accent)] uppercase flex items-center gap-2"><Volume2 className="w-3 h-3" /> Voice & Audio</h3>
                        <div className="flex flex-col gap-2 p-3 bg-[var(--bg-surface-hover)] border border-[var(--border-color)] rounded-lg">
                           <span className="text-sm text-[var(--text-main)]">Voice: Google Neural2 (en-US-Neural2-F)</span>
                        </div>
                        <div className="flex flex-col gap-2">
                           <label className="flex items-center justify-between text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider">
                              <span>Speech Rate</span>
                              <span className="text-[var(--accent)]">{settings.speechRate.toFixed(1)}x</span>
                           </label>
                           <input type="range" min="0.5" max="2" step="0.1" value={settings.speechRate} onChange={(e) => setSettings({...settings, speechRate: parseFloat(e.target.value)})} className="accent-[var(--accent)]" />
                        </div>
                        <label className="flex items-center justify-between cursor-pointer group p-3 bg-[var(--bg-surface-hover)] border border-[var(--border-color)] rounded-lg">
                           <span className="text-sm text-[var(--text-main)] group-hover:text-[var(--accent)] transition-colors">Auto-Speak Responses</span>
                           <input type="checkbox" checked={settings.autoSpeak} onChange={(e) => setSettings({...settings, autoSpeak: e.target.checked})} className="w-4 h-4 accent-[var(--accent)]" />
                        </label>
                     </section>

                     {/* Wake Word Behavior */}
                     <section className="flex flex-col gap-4">
                        <h3 className="text-[10px] font-mono tracking-widest text-[var(--accent)] uppercase flex items-center gap-2"><Mic className="w-3 h-3" /> Wake Word Behavior</h3>
                        <label className="flex items-center justify-between cursor-pointer group p-3 bg-[var(--bg-surface-hover)] border border-[var(--border-color)] rounded-lg">
                           <span className="text-sm text-[var(--text-main)] group-hover:text-[var(--accent)] transition-colors">Hands-Free (Continuous)</span>
                           <input type="checkbox" checked={settings.handsFree} onChange={(e) => setSettings({...settings, handsFree: e.target.checked})} className="w-4 h-4 accent-[var(--accent)]" />
                        </label>
                        <div className="flex flex-col gap-2">
                           <label className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider">Wake Word</label>
                           <input type="text" value={settings.wakeWord} onChange={(e) => setSettings({...settings, wakeWord: e.target.value})} className="bg-[var(--bg-surface-hover)] border border-[var(--border-color)] rounded-lg p-2.5 text-sm outline-none focus:border-[var(--accent-50)] transition-colors text-[var(--text-main)]" />
                        </div>
                        <div className="flex flex-col gap-2">
                           <label className="flex items-center justify-between text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider">
                              <span>Wake Timeout</span>
                              <span className="text-[var(--accent)]">{settings.wakeTimeout}s</span>
                           </label>
                           <input type="range" min="3" max="15" step="1" value={settings.wakeTimeout} onChange={(e) => setSettings({...settings, wakeTimeout: parseInt(e.target.value)})} className="accent-[var(--accent)]" />
                        </div>
                        <div className="flex flex-col gap-2">
                           <label className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider">Wake Acknowledgement</label>
                           <select value={settings.wakeMode} onChange={(e) => setSettings({...settings, wakeMode: e.target.value as "beep" | "tts"})} className="bg-[var(--bg-surface-hover)] border border-[var(--border-color)] rounded-lg p-2.5 text-sm outline-none focus:border-[var(--accent-50)] text-[var(--text-main)]">
                              <option value="beep">Beep Sound</option>
                              <option value="tts">Voice (TTS)</option>
                           </select>
                        </div>
                        {settings.wakeMode === "tts" && (
                           <div className="flex flex-col gap-2">
                              <label className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider">Acknowledgement Phrase</label>
                              <input type="text" value={settings.wakeAcknowledge} onChange={(e) => setSettings({...settings, wakeAcknowledge: e.target.value})} className="bg-[var(--bg-surface-hover)] border border-[var(--border-color)] rounded-lg p-2.5 text-sm outline-none focus:border-[var(--accent-50)] transition-colors text-[var(--text-main)]" />
                           </div>
                        )}
                     </section>
                  </div>
               </motion.div>
            </motion.div>
         )}
      </AnimatePresence>

      {/* MAIN VIEW */}
      <main className="flex-1 flex flex-col relative py-6 md:py-10">
        <header className="px-6 md:px-10 flex justify-between items-center shrink-0 z-10 p-4">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} aria-label="Toggle Sidebar" className="p-2 -ml-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] rounded-lg transition-colors z-20 focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
               <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mix-blend-screen opacity-50 pointer-events-none">
            <Mic className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-xs font-mono tracking-widest text-[var(--text-main)] uppercase">{settings.wakeWord} System</span>
            </div>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setIsSettingsOpen(true)} aria-label="Settings" className="p-2 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-10)] rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)]" title="Settings">
                <Sliders className="w-4 h-4" />
             </button>
             <button onClick={handleExport} aria-label="Export Chat" className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)]" title="Export Chat">
                <Download className="w-4 h-4" />
             </button>
             <button onClick={handleClearAll} aria-label="Clear Current Chat" className="p-1.5 text-red-400/50 hover:text-red-400 transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)]" title="Clear Current Chat">
                <Trash2 className="w-4 h-4" />
             </button>
          </div>
        </header>

        <div
          className="flex-1 flex flex-col overflow-y-auto px-6 md:px-10 mask-image-fade relative z-10"
          style={{ scrollBehavior: "smooth" }}
        >
          <div className="w-full max-w-[700px] mx-auto flex flex-col gap-8 pb-20 mt-auto">
            {messages.length === 1 && state === "idle" && (
              <div className="flex flex-col items-center justify-center gap-6 mt-10">
                 <p className="font-mono text-xs tracking-widest text-[var(--accent)] uppercase text-center opacity-80">
                   Suggested Commands
                 </p>
                 <div className="flex gap-3 flex-wrap justify-center max-w-md">
                   {SUGGESTIONS.map((cmd) => (
                      <button 
                        key={cmd}
                        onClick={() => sendCommand(cmd)}
                        className="px-4 py-2 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-full text-xs text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent-30)] hover:bg-[var(--accent-10)] transition-all shadow-sm focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
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
                className={`flex w-full group ${msg.role === "user" ? "justify-end text-right" : "justify-start"} transition-all mb-4`}
              >
                <div className={`flex flex-col max-w-[85%] md:max-w-[75%] relative z-10 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <span className="text-[10px] uppercase tracking-[2px] text-[var(--text-muted)] mb-2 px-1">
                    {msg.role === "user" ? "User Input" : "Catherine Response"}
                  </span>
                  <div
                    className={`text-[15px] leading-[1.6] backdrop-blur-xl
                             ${
                               msg.role === "catherine"
                                 ? "text-[var(--text-main)] p-5 bg-[var(--bg-surface)] rounded-2xl rounded-tl-sm border border-[var(--border-color)] shadow-md"
                                 : "text-[var(--bg-main)] py-3 px-5 bg-[var(--text-main)] rounded-2xl rounded-tr-sm shadow-md"
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
                        <div className="markdown-body text-[var(--text-main)]">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                  <div className={`flex gap-4 mt-2 w-full items-center ${msg.role === "user" ? "justify-end flex-row-reverse" : "justify-start"}`}>
                    <div className="flex items-center gap-1">
                        {msg.role === "user" && (
                            <button onClick={() => handleDeleteMessage(msg.id)} aria-label="Delete Message" className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all" title="Delete Message">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {msg.role === "catherine" && (
                            <button onClick={() => handleCopy(msg.id, msg.content)} aria-label="Copy Response" className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-10)] rounded-lg transition-all" title="Copy Response">
                                {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                        )}
                    </div>
                    {msg.timestamp && (
                      <span
                        className={`text-[10px] text-[var(--text-muted)] font-mono px-1`}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    )}
                    {msg.role === "catherine" && msg.isNew && process.env.NODE_ENV === "development" && (
                       <span className="text-[9px] text-[var(--text-muted)] opacity-50 font-mono tracking-widest uppercase flex gap-2">
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
                      <span className="text-[10px] uppercase tracking-[2px] text-[var(--text-muted)] mb-2 px-1">
                    Catherine is typing...
                  </span>
                      <div className="text-sm text-[var(--text-main)] p-5 bg-[var(--bg-surface)] rounded-2xl rounded-tl-sm border border-[var(--border-color)] shadow-md flex items-center justify-center min-w-[80px] h-[52px] backdrop-blur-2xl overflow-hidden relative">
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

          <div className="flex items-center gap-4 bg-[var(--bg-surface)] backdrop-blur-3xl border border-[var(--border-color)] p-3 rounded-[40px] shadow-2xl w-full relative transition-colors">
            
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
                ) : (
                  <motion.p 
                    key={state}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`flex items-center gap-2 text-[9px] font-mono tracking-[0.2em] uppercase ${status.color.split(' ')[1]}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${status.color.split(' ')[0]} shadow-[0_0_8px_currentColor]`} />
                    {status.label}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <form 
               onSubmit={(e) => { e.preventDefault(); const form = e.target as HTMLFormElement; const input = form.elements.namedItem('q') as HTMLInputElement; const t = input.value; if(t) sendCommand(t); form.reset(); }}
               className="flex-1 flex items-center bg-[var(--bg-surface-hover)] hover:bg-[var(--border-color)] transition-colors rounded-full px-6 h-[56px] border border-[var(--border-color)] group focus-within:border-[var(--accent-40)] focus-within:bg-[var(--bg-surface)]"
            >
               <input 
                  name="q"
                  type="text"
                  placeholder="Message Catherine..."
                  className="bg-transparent border-none outline-none text-[15px] p-2 text-[var(--text-main)] w-full placeholder-[var(--text-muted)]"
                  autoComplete="off"
               />
               <button type="submit" className="hidden"></button>
            </form>

            <button
              onClick={toggleRecording}
              disabled={settings.handsFree}
              aria-label={state === "listening" ? "Stop Recording" : "Start Recording"}
              className={`relative flex items-center justify-center w-[64px] h-[64px] rounded-full shrink-0 focus:outline-none transition-all duration-300 shadow-[0_0_30px_var(--accent-20)]
                    ${
                      state === "listening"
                        ? "bg-[#ef4444] shadow-[0_0_30px_rgba(239,68,68,0.5)] text-white scale-110"
                        : "bg-[var(--accent)] hover:scale-105 active:scale-95 text-[#030303]"
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
             <span className="text-[8px] font-mono tracking-widest uppercase text-[var(--text-muted)]">
               {sysStatus === 'ok' ? 'API_ONLINE' : sysStatus === 'checking' ? 'PINGING...' : 'API_ERR'}
             </span>
          </div>
          <div className="flex items-center gap-1.5 opacity-60 ml-3">
             <div className={`w-1.5 h-1.5 rounded-full ${state !== 'idle' ? 'bg-cyan-400 shadow-[0_0_5px_#22d3ee]' : 'bg-red-500 shadow-[0_0_5px_#ef4444]'}`} />
             <span className="text-[8px] font-mono tracking-widest uppercase text-[var(--text-muted)]">
               {state !== 'idle' ? 'CORE_ACTIVE' : 'CORE_IDLE'}
             </span>
          </div>
        </div>
      </main>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        :root {
          --bg-main: #f8fafc;
          --bg-surface: #ffffff;
          --bg-surface-hover: #f1f5f9;
          --text-main: #0f172a;
          --text-muted: #64748b;
          --border-color: rgba(0, 0, 0, 0.1);
          --scrollbar-bg: transparent;
          --scrollbar-thumb: rgba(0, 0, 0, 0.2);
          color-scheme: light;
        }
        .dark {
          --bg-main: #030303;
          --bg-surface: #0a0a0a;
          --bg-surface-hover: rgba(255, 255, 255, 0.05);
          --text-main: #e5e5e5;
          --text-muted: rgba(255, 255, 255, 0.5);
          --border-color: rgba(255, 255, 255, 0.1);
          --scrollbar-bg: transparent;
          --scrollbar-thumb: rgba(255, 255, 255, 0.1);
          color-scheme: dark;
        }
        
        .mask-image-fade {
           mask-image: linear-gradient(to bottom, transparent, black 10%, black 100%, black);
           -webkit-mask-image: linear-gradient(to bottom, transparent, black 10%, black 100%, black);
        }
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: var(--scrollbar-bg);
        }
        ::-webkit-scrollbar-thumb {
          background: var(--scrollbar-thumb);
          border-radius: 10px;
          transition: background 0.3s ease;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: var(--accent-50);
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
           className="w-[120px] h-[120px] rounded-full border border-[var(--accent-20)] bg-[var(--bg-main)]/60 backdrop-blur-xl shadow-[inset_0_0_30px_var(--accent-10)] flex items-center justify-center relative overflow-hidden"
       >
          <div className={`absolute inset-0 bg-gradient-to-tr from-[var(--accent-10)] to-transparent transition-opacity duration-500 ${state !== 'idle' ? 'opacity-100' : 'opacity-0'}`} />
          <div className={`w-[40px] h-[40px] rounded-full bg-[var(--accent)] transition-all duration-300 ${state !== 'idle' ? 'blur-[15px] opacity-80' : 'blur-[25px] opacity-30'} ${isSpeaking ? 'animate-pulse' : ''}`} />
       </motion.div>
    </div>
  );
});
