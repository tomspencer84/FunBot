/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Bot, 
  User, 
  Send, 
  Trash2, 
  RotateCcw, 
  Info, 
  BrainCircuit, 
  Key, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  Search,
  MessageSquare,
  ShieldCheck,
  Cpu,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { get, set, del } from 'idb-keyval';
import Markdown from 'react-markdown';

// Constants
const MEMORY_KEY = 'funbot_memory_file';
const API_KEY_STORAGE = 'funbot_gemini_api_key';
const CHAT_HISTORY_KEY = 'funbot_chat_history';

// --- QUOTA & ENGINE CONTROL ---
// Set LaunchAgents = False to simulate the 3-agent debate in a single, 
// more efficient "internal monologue" prompt. This saves tokens and 
// improves response speed while maintaining the same persona and memory logic.
const LAUNCH_AGENTS = false;

enum MessageRole {
  USER = 'user',
  BOT = 'bot',
  SYSTEM = 'system'
}

interface Message {
  role: MessageRole;
  content: string;
  isAgentic?: boolean;
  agentDiscussion?: string[];
}

export default function App() {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [apiKey, setApiKey] = useState<string | null>(localStorage.getItem(API_KEY_STORAGE));
  const [tempApiKey, setTempApiKey] = useState('');
  const [memoryFile, setMemoryFile] = useState<string>('Nothing yet, let\'s chat to get my memory going :)');
  const [isLoading, setIsLoading] = useState(false);
  const [showExplanation, setShowExplanation] = useState(true);
  const [isWiping, setIsWiping] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize
  useEffect(() => {
    const init = async () => {
      const savedMemory = await get(MEMORY_KEY);
      if (savedMemory) setMemoryFile(savedMemory);
      
      const savedHistory = localStorage.getItem(CHAT_HISTORY_KEY);
      if (savedHistory) setMessages(JSON.parse(savedHistory));

      const savedKey = localStorage.getItem(API_KEY_STORAGE);
      if (savedKey) {
        // Remove any non-ISO-8859-1 characters that might cause fetch errors
        const sanitized = savedKey.replace(/[^\x20-\x7E]/g, "");
        if (sanitized !== savedKey) {
          localStorage.setItem(API_KEY_STORAGE, sanitized);
        }
        setApiKey(sanitized);
      }
    };
    init();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages));
  }, [messages]);

  // Model access
  const getAI = () => {
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  };

  const handleSetApiKey = () => {
    if (tempApiKey.trim()) {
      // Remove any non-ISO-8859-1 characters that might cause fetch errors
      const sanitized = tempApiKey.trim().replace(/[^\x20-\x7E]/g, "");
      localStorage.setItem(API_KEY_STORAGE, sanitized);
      setApiKey(sanitized);
    }
  };

  const clearApiKey = () => {
    localStorage.removeItem(API_KEY_STORAGE);
    setApiKey(null);
  };

  // Helper to detect questions
  const isQuestion = (text: string) => {
    const questionWords = ['what', 'how', 'why', 'who', 'where', 'when', 'is', 'can', 'should', 'if', 'could'];
    const trimmed = text.toLowerCase().trim();
    return trimmed.endsWith('?') || questionWords.some(word => trimmed.startsWith(word));
  };

  // Agentic discussion logic
  const runAgenticDiscussion = async (question: string) => {
    const ai = getAI();
    if (!ai) return;

    try {
      // Prompt selection based on LAUNCH_AGENTS flag
      const prompt = LAUNCH_AGENTS 
        ? `You are simulating FunBot's agentic reasoning engine.
          
          USER QUESTION: "${question}"
          CURRENT MEMORY: "${memoryFile}"
          
          TASK:
          1. Conduct a deep 3-round debate between 3 agents:
             - "Obvious": Straightforward, conventional, safe.
             - "Contrarian": Alternative viewpoints, critical, devil's advocate.
             - "Edge Case": Rare possibilities, technical details, unusual scenarios.
          
          2. DEBATE STRUCTURE:
             - ROUND 1: Initial perspectives (2-3 sentences each). 
             - ROUND 2: Reacting/challenging others (2-3 sentences each). 
             - ROUND 3: Rebuttal/final agent stance (2-3 sentences each). 
          
          3. RESPONSE: As FunBot (warm, calming, wise), summarize the debate tension and provide the definitive best answer.
          4. MEMORY: Extract any new facts/preferences about the user from this question and integrate them into the memory text.
          
          RETURN ONLY A VALID JSON OBJECT:
          {
            "round1": "[Obvious]: \"...\"\n[Contrarian]: \"...\"\n[Edge Case]: \"...\"",
            "round2": "[Obvious]: \"...\"\n[Contrarian]: \"...\"\n[Edge Case]: \"...\"",
            "round3": "[Obvious]: \"...\"\n[Contrarian]: \"...\"\n[Edge Case]: \"...\"",
            "final": "FunBot's warm markdown response",
            "updatedMemory": "Full updated memory text"
          }`
        : `You are simulating FunBot's agentic reasoning engine.
          
          USER QUESTION: "${question}"
          CURRENT MEMORY: "${memoryFile}"
          
          TASK:
          1. Synthesize a 3-agent debate (Obvious, Contrarian, Edge Case) into concise rounds.
          2. RESPONSE: As FunBot (warm, calming, wise), provide a definitive answer.
          3. MEMORY: Update the memory text.
          
          RETURN ONLY A VALID JSON OBJECT (Keep rounds concise):
          {
            "round1": "[Obvious]: \"...\"\n[Contrarian]: \"...\"\n[Edge Case]: \"...\"",
            "round2": "[Obvious]: \"...\"\n[Contrarian]: \"...\"\n[Edge Case]: \"...\"",
            "round3": "[Obvious]: \"...\"\n[Contrarian]: \"...\"\n[Edge Case]: \"...\"",
            "final": "FunBot's warm markdown response",
            "updatedMemory": "Full updated memory text"
          }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          { role: 'user', parts: [{ text: prompt }] }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const data = JSON.parse(response.text || "{}");
      
      if (data.updatedMemory) {
        setMemoryFile(data.updatedMemory);
        set(MEMORY_KEY, data.updatedMemory);
      }

      return {
        final: data.final || "I'm sorry, I couldn't synthesize a conclusion.",
        discussion: [data.round1 || "", data.round2 || "", data.round3 || ""]
      };
    } catch (err: any) {
      console.error(err);
      // Basic retry logic for 429
      if (err.message?.includes('429')) {
        return { error: "I'm a bit overwhelmed with thoughts right now. Please wait a moment and try again so I can give you my full attention." };
      }
      return { error: err.message || "Unknown error during agentic discussion" };
    }
  };

  // Memory extraction logic (now primarily handled in discussion, but kept for direct statements)
  const updateMemory = async (userMsg: string, botMsg: string) => {
    // This is now redundant for questions, but useful for simple statements
    const ai = getAI();
    if (!ai) return;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          { role: 'user', parts: [{ text: `Current "What I Remember" file content:
          """
          ${memoryFile}
          """

          New dialogue:
          User: ${userMsg}
          Bot: ${botMsg}

          TASK: Extract any important personal information, preferences, facts, or context from the new dialogue and integrate it into the "What I Remember" text. 
          Maintain a concise, organized list or professional summary structure. 
          If no new info is present, return the original text. 
          The output should be the full updated text. Keep it well-formatted. Max 3 pages equivalent length.` }] }
        ]
      });

      const updated = response.text?.trim();
      if (updated) {
        setMemoryFile(updated);
        await set(MEMORY_KEY, updated);
      }
    } catch (err) {
      console.error("Memory update failed", err);
    }
  };

  // Handle send
  const onSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    const newMessages = [...messages, { role: MessageRole.USER, content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);

    const isQuestionInput = isQuestion(userMsg);

    if (isQuestionInput) {
      // Check for manual delete request
      if (userMsg.toLowerCase().includes('delete memory') || userMsg.toLowerCase().includes('wipe memory')) {
        await deleteMemoryFile();
        setMessages(prev => [...prev, { role: MessageRole.BOT, content: "Memory cleared. Nothing yet, let's chat to get my memory going :) " }]);
        setIsLoading(false);
        return;
      }

      const result = await runAgenticDiscussion(userMsg);
      if (result && 'final' in result) {
        const botMsg: Message = { 
          role: MessageRole.BOT, 
          content: result.final as string, 
          isAgentic: true, 
          agentDiscussion: result.discussion 
        };
        setMessages(prev => [...prev, botMsg]);
        // Memory update is now handled inside runAgenticDiscussion
      } else {
        const errorDetail = result && 'error' in result ? (result as any).error : "Unknown error";
        setMessages(prev => [...prev, { role: MessageRole.BOT, content: `I encountered an error while launching my agents: ${errorDetail}` }]);
      }
    } else {
      // Normal response for statements
      const ai = getAI();
      if (ai) {
        try {
          // Optimize simple statements too: return response and memory update in one call
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
              { role: 'user', parts: [{ text: `You are FunBot, a calming, companionable AI. 
              The user said: "${userMsg}"
              MEMORY: "${memoryFile}"
              
              Respond warmly. Also, extract any new context to update the memory.
              
              RETURN JSON:
              {
                "response": "Warm markdown response",
                "updatedMemory": "Full updated memory text"
              }` }] }
            ],
            config: {
              responseMimeType: "application/json"
            }
          });
          
          const data = JSON.parse(response.text || "{}");
          const botResponse = data.response || "I'm here for you.";
          setMessages(prev => [...prev, { role: MessageRole.BOT, content: botResponse }]);
          
          if (data.updatedMemory) {
            setMemoryFile(data.updatedMemory);
            set(MEMORY_KEY, data.updatedMemory);
          }
        } catch (err: any) {
          if (err.message?.includes('429')) {
            setMessages(prev => [...prev, { role: MessageRole.BOT, content: "I'm receiving a lot of messages right now. Let's take a deep breath and wait just a moment before we continue our conversation." }]);
          } else {
            setMessages(prev => [...prev, { role: MessageRole.BOT, content: `I'm having trouble connecting right now: ${err.message || 'Unknown error'}` }]);
          }
        }
      }
    }
    
    setIsLoading(false);
  };

  const resetChat = () => {
    setMessages([]);
    localStorage.removeItem(CHAT_HISTORY_KEY);
  };

  const deleteMemoryFile = async () => {
    const empty = "Nothing yet, let's chat to get my memory going :)";
    setMemoryFile(empty);
    await set(MEMORY_KEY, empty);
  };

  const fullReset = async () => {
    setIsWiping(true);
    setTimeout(async () => {
      setMessages([]);
      localStorage.removeItem(CHAT_HISTORY_KEY);
      const empty = "Nothing yet, let's chat to get my memory going :)";
      setMemoryFile(empty);
      await set(MEMORY_KEY, empty);
      setIsWiping(false);
    }, 1000);
  };

  // UI Components
  if (!apiKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-8 shadow-xl max-w-md w-full border border-slate-100"
        >
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
              <Key size={32} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-slate-900">Welcome to FunBot</h1>
              <p className="text-slate-500">Please enter your Google Gemini API key to begin our journey together.</p>
            </div>
            <div className="w-full space-y-4">
              <input 
                type="password"
                placeholder="Enter Gemini API key..."
                className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
              />
              <button 
                onClick={handleSetApiKey}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
              >
                Start Exploration
              </button>
              <a 
                href="https://aistudio.google.com/app/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center space-x-2 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors"
              >
                <span>Get an API Key</span>
                <ExternalLink size={16} />
              </a>
            </div>
            <p className="text-xs text-slate-400">
              Your key is stored locally in your browser and is never sent to our servers.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FD] font-sans text-slate-700 flex flex-col md:flex-row">
      {/* Sidebar - Memory & Info */}
      <aside className="w-full md:w-80 lg:w-96 bg-white border-r border-slate-100 flex flex-col overflow-hidden">
        <div className="p-6 border-bottom border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-tr from-blue-400 to-indigo-500 p-2 rounded-xl text-white shadow-md shadow-blue-100">
              <Bot size={24} />
            </div>
            <span className="font-bold text-lg text-slate-900 tracking-tight">FunBot</span>
          </div>
          <button 
            onClick={() => setShowExplanation(!showExplanation)}
            className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors"
          >
            <Info size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
          {/* Explanation Section */}
          <AnimatePresence>
            {showExplanation && (
              <motion.section 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-blue-50/50 rounded-2xl p-5 space-y-4 border border-blue-100/50 overflow-hidden"
              >
                <div className="flex items-center space-x-2 text-blue-700">
                  <Sparkles size={18} />
                  <h2 className="font-semibold">App Capabilities</h2>
                </div>
                <div className="space-y-3 text-sm text-blue-900/70">
                  <p>• <strong>Agentic AI:</strong> Ask a question to spark a 3-agent debate (Obvious, Contrarian, Edge Case) for deep insights.</p>
                  <p>• <strong>Smart Memory:</strong> I automatically remember details about you to provide a personalized experience.</p>
                  <p>• <strong>Privacy:</strong> All data stays in your browser's IndexedDB/LocalStorage.</p>
                </div>
                <button 
                  onClick={() => setShowExplanation(false)}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  Got it, hide this
                </button>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Controls */}
          <div className="space-y-3 pt-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">System</h3>
            <button 
              onClick={resetChat}
              className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all text-sm font-medium border border-slate-100"
            >
              <div className="flex items-center space-x-3">
                <MessageSquare size={18} className="text-slate-400" />
                <span>Clear Chat History</span>
              </div>
              <RotateCcw size={16} className="text-slate-300" />
            </button>
            <button 
              onClick={fullReset}
              className="w-full flex items-center justify-between p-3 bg-red-50/30 hover:bg-red-50 rounded-xl transition-all text-sm font-medium border border-red-100/50 text-red-600"
            >
              <div className="flex items-center space-x-3">
                <AlertCircle size={18} />
                <span>Total Reset</span>
              </div>
              {isWiping ? (
                <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Trash2 size={16} />
              )}
            </button>
            <button 
              onClick={clearApiKey}
              className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-all text-xs font-medium text-slate-400 border border-transparent"
            >
              <div className="flex items-center space-x-3">
                <Key size={14} />
                <span>Change API Key</span>
              </div>
              <ShieldCheck size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-h-0 bg-white md:bg-transparent">
        {/* Horizontal Memory Section */}
        <div className="p-4 md:p-8 pb-0 md:pb-0">
          <section className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-900">
                <BrainCircuit size={18} className="text-indigo-500" />
                <h2 className="font-semibold text-sm">What I Remember</h2>
              </div>
              <button 
                onClick={deleteMemoryFile}
                className="p-1.5 hover:bg-red-50 text-slate-300 hover:text-red-400 rounded-md transition-all"
                title="Wipe Memory File"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="text-[11px] leading-relaxed whitespace-pre-wrap text-slate-500 max-h-24 overflow-y-auto scrollbar-hide">
              {memoryFile}
            </div>
          </section>
        </div>

        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 scroll-smooth"
        >
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 max-w-sm mx-auto">
              <div className="w-20 h-20 bg-blue-100 rounded-3xl flex items-center justify-center text-blue-600 animate-pulse">
                <Bot size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-900">How can I help you today?</h3>
                <p className="text-slate-500 text-sm italic">
                  "Ask me a question to see my agentic side, or just share your day with me."
                </p>
              </div>
            </div>
          )}

          <AnimatePresence>
            {messages.map((msg, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex w-full ${msg.role === MessageRole.USER ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex items-start space-x-3 max-w-[85%] md:max-w-[70%] ${msg.role === MessageRole.USER ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`p-2 rounded-xl shrink-0 ${
                    msg.role === MessageRole.USER 
                      ? 'bg-slate-800 text-white' 
                      : msg.role === MessageRole.BOT 
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-100'
                        : 'bg-slate-100 text-slate-400'
                  }`}>
                    {msg.role === MessageRole.USER ? <User size={20} /> : <Bot size={20} />}
                  </div>
                  
                  <div className="space-y-3">
                    <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                      msg.role === MessageRole.USER 
                        ? 'bg-white border border-slate-200 text-slate-800 rounded-tr-none shadow-sm' 
                        : 'bg-white border border-blue-50 text-slate-800 rounded-tl-none shadow-md shadow-blue-50/50'
                    }`}>
                      <div className="prose prose-sm prose-slate max-w-none prose-p:leading-relaxed prose-code:bg-slate-100 prose-code:px-1 prose-code:rounded">
                        <Markdown>
                          {msg.content}
                        </Markdown>
                      </div>
                    </div>

                    {msg.isAgentic && msg.agentDiscussion && (
                      <div className="space-y-2">
                        <details className="group">
                          <summary className="flex items-center space-x-2 text-[10px] uppercase tracking-wider font-bold text-blue-500 cursor-pointer hover:text-blue-600 transition-colors list-none">
                            <div className="flex items-center space-x-1">
                              <Cpu size={12} />
                              <span>View Multi-Agent Debate Records</span>
                            </div>
                          </summary>
                          <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }}
                            className="mt-3 p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-4 text-[11px] font-mono text-slate-600"
                          >
                            {msg.agentDiscussion.map((round, rIdx) => (
                              <div key={rIdx} className="space-y-1">
                                <span className="text-indigo-400 font-bold block mb-1">
                                  ROUND {rIdx + 1} DISCUSSION:
                                </span>
                                <div className="whitespace-pre-wrap opacity-80 border-l-2 border-slate-200 pl-3">
                                  {round}
                                </div>
                              </div>
                            ))}
                          </motion.div>
                        </details>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
              <div className="flex items-center space-x-3">
                <div className="bg-blue-100 animate-bounce p-2 rounded-xl text-blue-600">
                  <Bot size={20} />
                </div>
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 md:p-8 bg-gradient-to-t from-white via-white to-transparent">
          <div className="max-w-4xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative bg-white border border-slate-200 rounded-2xl flex items-center shadow-lg overflow-hidden">
              <input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSend()}
                placeholder="Say something, or ask a deep question..."
                className="flex-1 px-6 py-4 outline-none text-sm text-slate-800 placeholder:text-slate-400"
              />
              <button 
                onClick={onSend}
                disabled={!input.trim() || isLoading}
                className="p-4 mr-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all shadow-md shadow-blue-200"
              >
                <Send size={18} />
              </button>
            </div>
            <div className="mt-2 flex justify-center">
              <p className="text-[10px] text-slate-400">
                FunBot is powered by Gemini 2.0 Flash • High Efficiency mode active
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Global CSS for markdown and scrollbars */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .prose p {
          margin-bottom: 0.5rem;
        }
        .prose p:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  );
}
