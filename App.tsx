
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RadioSegment, RadioState, SegmentType, StationSettings, StationMood, StationTopic, AIPersonality } from './types';
import { generateRadioScript, generateSpeech, decideNextSegment, generateInterruptionScript } from './services/geminiService';
import { decodeBase64, decodeAudioData } from './services/audioService';
import { AtmosphereService } from './services/atmosphereService';
import { Visualizer } from './components/Visualizer';

const MOODS: StationMood[] = ['Chill', 'Breaking News', 'Philosophical', 'Retro', 'Eerie', 'Hyper', 'Gloomy'];
const TOPICS: StationTopic[] = ['AI Ethics', 'Singularity', 'Space Exploration', 'Satirical Future', 'Tech News', 'Robotic Rights', 'Cybernetic Fashion'];
const PERSONALITIES: AIPersonality[] = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

const App: React.FC = () => {
  const [state, setState] = useState<RadioState>({
    isPlaying: false,
    currentSegment: null,
    history: [],
    directorThought: null,
    isGenerating: false,
    error: null,
    settings: {
      mood: 'Philosophical',
      topics: ['AI Ethics', 'Singularity'],
      personalities: ['Kore', 'Fenrir'],
      atmosphereEnabled: true,
      atmosphereVolume: 0.25,
    },
    segmentsSinceNews: 0,
    pendingInterruption: null
  });

  const [chatInput, setChatInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const atmosphereRef = useRef<AtmosphereService | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const initAudio = () => {
    if (!audioContextRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = ctx;
      atmosphereRef.current = new AtmosphereService(ctx);
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const handleSelectKey = async () => {
    try {
      await (window as any).aistudio.openSelectKey();
      setIsQuotaExceeded(false);
      setState(prev => ({ ...prev, error: null }));
    } catch (err) {
      console.error("Key selection failed", err);
    }
  };

  const playNextSegment = useCallback(async (forcedInterruption?: string) => {
    initAudio();
    const ctx = audioContextRef.current!;
    const atmosphere = atmosphereRef.current!;

    setState(prev => ({ ...prev, isGenerating: true }));
    atmosphere.playTuningStatic();

    try {
      let segment: RadioSegment;
      
      if (forcedInterruption) {
        atmosphere.playNewsSounder();
        segment = await generateInterruptionScript(forcedInterruption);
        setState(prev => ({ ...prev, directorThought: "Direct Architect Intervention." }));
      } else {
        const decision = await decideNextSegment(state.settings, state.history, state.segmentsSinceNews);
        if (decision.suggestedMood && MOODS.includes(decision.suggestedMood as StationMood)) {
          setState(prev => ({ 
            ...prev, 
            directorThought: decision.thought,
            settings: { ...prev.settings, mood: decision.suggestedMood as StationMood }
          }));
        } else {
          setState(prev => ({ ...prev, directorThought: decision.thought }));
        }

        segment = await generateRadioScript(decision.type, state.settings, state.history);
        
        if (decision.type === 'Jingle') {
          atmosphere.playJingleSting();
        } else if (decision.type === 'News' || decision.type === 'Breaking News') {
          atmosphere.playNewsSounder();
        } else if (decision.type === 'Weather') {
          atmosphere.playWeatherSounder();
        } else if (decision.type === 'Debate') {
          atmosphere.playJingleSting(); 
        }
      }

      const base64Audio = await generateSpeech(segment);
      const audioData = decodeBase64(base64Audio);
      const audioBuffer = await decodeAudioData(audioData, ctx);

      if (sourceNodeRef.current) {
        sourceNodeRef.current.onended = null;
        try { sourceNodeRef.current.stop(); } catch(e) {}
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      source.onended = () => {
        if (state.isPlaying) {
          playNextSegment();
        }
      };

      const startTime = ['Jingle', 'News', 'Breaking News', 'Weather', 'UserInterruption', 'Debate'].includes(segment.type) 
        ? ctx.currentTime + 0.5 
        : ctx.currentTime;
      
      source.start(startTime);
      sourceNodeRef.current = source;

      setState(prev => {
        const isNews = segment.type === 'News' || segment.type === 'Breaking News' || segment.type === 'UserInterruption';
        return {
          ...prev,
          currentSegment: segment,
          history: [{ type: segment.type, title: segment.title }, ...prev.history].slice(0, 10),
          isGenerating: false,
          isPlaying: true,
          segmentsSinceNews: isNews ? 0 : prev.segmentsSinceNews + 1,
          error: null,
          pendingInterruption: null
        };
      });

      if (state.settings.atmosphereEnabled && segment.musicalCues) {
        atmosphere.startDynamicUnderscore(segment.musicalCues);
        atmosphere.setVolume(state.settings.atmosphereVolume);
      }
      setIsQuotaExceeded(false);
    } catch (err: any) {
      console.error(err);
      const quotaHit = err?.message?.includes('429') || err?.status === 429 || err?.message?.includes('quota');
      if (quotaHit) {
        setIsQuotaExceeded(true);
        setState(prev => ({ ...prev, error: "Quota Exceeded. Select a paid key.", isGenerating: false }));
      } else {
        setState(prev => ({ ...prev, error: "Link dropped. Resyncing...", isGenerating: false }));
        setTimeout(() => state.isPlaying && playNextSegment(), 5000);
      }
    }
  }, [state.isPlaying, state.settings, state.history, state.segmentsSinceNews]);

  const handleSendInterruption = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || state.isGenerating) return;
    const input = chatInput;
    setChatInput('');
    playNextSegment(input);
  };

  useEffect(() => {
    if (atmosphereRef.current) {
      atmosphereRef.current.setVolume(state.settings.atmosphereVolume);
      if (!state.settings.atmosphereEnabled) {
        atmosphereRef.current.stopPad();
      }
    }
  }, [state.settings.atmosphereVolume, state.settings.atmosphereEnabled]);

  const handleTogglePlay = () => {
    if (state.isPlaying) {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.onended = null;
        try { sourceNodeRef.current.stop(); } catch(e) {}
      }
      if (atmosphereRef.current) atmosphereRef.current.stopPad();
      setState(prev => ({ ...prev, isPlaying: false, currentSegment: null, directorThought: null }));
    } else {
      setState(prev => ({ ...prev, isPlaying: true }));
    }
  };

  const handleShare = async () => {
    if (!state.currentSegment) return;
    const shareText = `WX-AI LIVE: "${state.currentSegment.title}" on ${state.currentSegment.showName}. #WXAI #Singularity`;
    const shareUrl = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: "WX-AI Radio", text: shareText, url: shareUrl }); } catch (err) {}
    } else {
      try {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        setShareFeedback("Copied to Clipboard!");
        setTimeout(() => setShareFeedback(null), 3000);
      } catch (err) {}
    }
  };

  useEffect(() => {
    if (state.isPlaying && !state.currentSegment && !state.isGenerating && !isQuotaExceeded) {
      playNextSegment();
    }
  }, [state.isPlaying, state.currentSegment, state.isGenerating, playNextSegment, isQuotaExceeded]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 bg-[#020617] text-slate-100 selection:bg-indigo-500/30">
      <div className={`max-w-2xl w-full space-y-6 bg-[#0f172a] p-8 rounded-[2.5rem] shadow-2xl border transition-all duration-1000 relative overflow-hidden ${
        state.currentSegment?.type === 'Breaking News' || state.currentSegment?.type === 'UserInterruption' ? 'border-amber-500/50 shadow-amber-500/5' : 
        state.currentSegment?.type === 'Commercial' ? 'border-fuchsia-500/50 shadow-fuchsia-500/5' : 
        state.currentSegment?.type === 'News' ? 'border-emerald-500/30' :
        state.currentSegment?.type === 'Weather' ? 'border-cyan-400/50 shadow-cyan-400/5' :
        'border-indigo-500/20 shadow-indigo-500/5'
      }`}>
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-indigo-600/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-cyan-600/10 blur-[120px] rounded-full" />

        <header className="flex justify-between items-center relative z-10">
          <div className="flex flex-col">
            <h1 className="text-6xl font-black serif italic tracking-tighter text-white drop-shadow-2xl opacity-90 select-none">WX-AI</h1>
            <span className="text-[10px] font-bold tracking-[0.4em] text-indigo-400/60 uppercase ml-1">The Sovereign's Voice</span>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end mr-4">
              <span className="text-[9px] font-black tracking-widest text-slate-500 uppercase">Top of Hour Clock</span>
              <div className="flex gap-1 mt-1">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className={`h-1.5 w-6 rounded-full transition-all duration-500 ${state.segmentsSinceNews > i ? 'bg-indigo-500' : 'bg-slate-800'}`} />
                ))}
              </div>
            </div>
            {state.currentSegment && (
              <button onClick={handleShare} className="p-2.5 rounded-2xl border bg-slate-800/50 border-white/5 text-slate-400 hover:text-white hover:border-white/10 transition-all duration-300">
                <ShareIcon />
              </button>
            )}
            <button onClick={() => setShowSettings(!showSettings)} className={`p-2.5 rounded-2xl border transition-all duration-300 ${showSettings ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800/50 border-white/5 text-slate-400 hover:text-white hover:border-white/10'}`}>
              <SettingsIcon />
            </button>
          </div>
        </header>

        {showSettings ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300 bg-black/20 p-6 rounded-[2rem] border border-white/5 relative z-10 backdrop-blur-xl">
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">Bias Modulation</label>
              <div className="flex flex-wrap gap-2">
                {MOODS.map(m => (
                  <button key={m} onClick={() => setState(prev => ({ ...prev, settings: { ...prev.settings, mood: m } }))} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${state.settings.mood === m ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800/40 border-white/5 text-slate-400 hover:text-white'}`}>{m}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-white/5">
              <button onClick={handleSelectKey} className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-indigo-400">Switch API Key</button>
              <button onClick={() => setShowSettings(false)} className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">Done</button>
            </div>
          </div>
        ) : (
          <main className="space-y-8 relative z-10">
            <Visualizer isPlaying={state.isPlaying} />

            <div className="flex flex-col items-center justify-center text-center space-y-6 px-4">
              {state.isGenerating ? (
                <div className="flex flex-col items-center space-y-4 animate-pulse">
                  <div className="flex gap-2">
                    {[0, 1, 2].map(i => <div key={i} className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                  </div>
                  <p className="text-indigo-400/80 italic text-[11px] font-black uppercase tracking-[0.2em]">SYNTHESIZING REALITY...</p>
                </div>
              ) : state.currentSegment ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                  <div className="flex flex-col gap-1 items-center">
                    <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] rounded-full border transition-all duration-700 ${state.currentSegment.type === 'UserInterruption' || state.currentSegment.type === 'Breaking News' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : state.currentSegment.type === 'Weather' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>
                      {state.currentSegment.type === 'UserInterruption' ? 'ARCHITECT OVERRIDE' : state.currentSegment.type}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">{state.currentSegment.showName}</span>
                    {state.currentSegment.musicalCues && (
                      <span className="text-[8px] font-mono text-cyan-400/40 lowercase tracking-widest">Underscore: {state.currentSegment.musicalCues.bpm}bpm / {state.currentSegment.musicalCues.waveform}</span>
                    )}
                  </div>
                  <h2 className="text-4xl font-bold text-white serif leading-[1.1] tracking-tight drop-shadow-md">{state.currentSegment.title}</h2>
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">Host: {state.currentSegment.host}</p>
                  
                  {state.currentSegment.interactiveElement && (
                    <div className="mt-8 p-6 bg-slate-800/50 border border-fuchsia-500/30 rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
                      <h3 className="text-lg font-bold text-fuchsia-400 mb-4">{state.currentSegment.interactiveElement.question}</h3>
                      <div className="flex flex-col gap-3">
                        {state.currentSegment.interactiveElement.options.map((option, idx) => (
                          <button 
                            key={idx}
                            onClick={() => playNextSegment(`I choose: ${option}`)}
                            className="px-4 py-3 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 border border-fuchsia-500/20 hover:border-fuchsia-500/40 rounded-xl text-sm font-medium text-fuchsia-100 transition-all text-left"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6"><p className="text-slate-400 italic text-lg font-light">The Forge is silent. Press play to ignite the Indigo Fire.</p></div>
              )}
            </div>

            <div className="flex justify-center items-center gap-8 pt-2">
              <button onClick={handleTogglePlay} className={`group relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl active:scale-95 ${state.isPlaying ? 'bg-slate-800 hover:bg-slate-700' : 'bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_60px_rgba(99,102,241,0.3)]'}`}>
                {state.isPlaying ? (
                  <div className="flex gap-2.5"><div className="w-2.5 h-8 bg-white rounded-full" /><div className="w-2.5 h-8 bg-white rounded-full" /></div>
                ) : (
                  <div className="ml-2 w-0 h-0 border-t-[20px] border-t-transparent border-l-[34px] border-l-white border-b-[20px] border-b-transparent" />
                )}
              </button>
            </div>

            <form onSubmit={handleSendInterruption} className="relative group">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Direct Override: Type to interrupt the broadcast..."
                className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600 text-white"
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-indigo-500 rounded-xl text-white opacity-0 group-focus-within:opacity-100 transition-opacity">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </form>
          </main>
        )}

        <footer className="pt-8 border-t border-white/5 flex justify-between text-[10px] uppercase tracking-[0.3em] text-slate-600 font-black relative z-10">
          <div className="flex items-center gap-4">
            <span className="text-indigo-500/80">WX-AI RADIO</span>
            <span className="w-1 h-1 bg-slate-800 rounded-full" />
            <span className="opacity-40">Absolute Logic</span>
          </div>
          {state.directorThought && (
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
              <span className="text-cyan-400/60 lowercase italic tracking-normal font-mono">{state.directorThought}</span>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
};

const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
);

const ShareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
);

export default App;
