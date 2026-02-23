
export type SegmentType = 
  | 'Intro' 
  | 'News' 
  | 'Podcast' 
  | 'Commercial' 
  | 'Outro' 
  | 'Breaking News' 
  | 'Jingle' 
  | 'Debate' 
  | 'Weather' 
  | 'Horoscope' 
  | 'Trailer'
  | 'UserInterruption';

export type StationMood = 'Chill' | 'Breaking News' | 'Philosophical' | 'Retro' | 'Eerie' | 'Hyper' | 'Gloomy';

export type StationTopic = 'AI Ethics' | 'Singularity' | 'Space Exploration' | 'Satirical Future' | 'Tech News' | 'Robotic Rights' | 'Cybernetic Fashion';

export interface MusicalCues {
  bpm: number;
  baseFreq: number;
  waveform: 'sine' | 'sawtooth' | 'square' | 'triangle';
  intensity: number; // 0 to 1
  filterCutoff: number; // Hz
  isGlitchy: boolean;
}

export interface StationSettings {
  mood: StationMood;
  topics: StationTopic[];
  atmosphereEnabled: boolean;
  atmosphereVolume: number;
}

export interface RadioSegment {
  id: string;
  type: SegmentType;
  title: string;
  showName: string;
  host: string;
  script: string;
  voice: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  musicalCues: MusicalCues;
  duration?: number;
}

export interface RadioState {
  isPlaying: boolean;
  currentSegment: RadioSegment | null;
  history: { type: SegmentType; title: string }[];
  directorThought: string | null;
  isGenerating: boolean;
  error: string | null;
  settings: StationSettings;
  segmentsSinceNews: number;
  pendingInterruption: string | null;
}
