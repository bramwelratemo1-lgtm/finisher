// FIX: Import React to provide type definitions for React.RefObject
import type React from 'react';

export interface PyannoteSegment {
    speaker: string;
    start: number;
    end: number;
}

export interface PyannoteDiarization {
    diarization: PyannoteSegment[];
}

export interface DiarizationSegment extends PyannoteSegment {}

export interface Speaker {
    name: string; // The display name, e.g., S1, which can be edited.
    color: string;
}

export type SpeakerMap = Record<string, Speaker>; // The key is the original speaker ID, e.g., "SPEAKER_00".

export interface MatchedWord {
    number: number;
    punctuated_word: string;
    cleaned_word: string;
    start: number | null;
    end: number | null;
    speakerLabel?: string; // e.g., "S1", "S?"
    isParagraphStart?: boolean; // True if this word starts a new paragraph
    mfaSource?: boolean;
    speaker?: string;
}

export interface TranscriptVersion {
    name: string;
    words: MatchedWord[];
}

// FIX: Add DiffType enum and Diff interface for DiffView component.
export enum DiffType {
    UNCHANGED = 'UNCHANGED',
    INSERTED = 'INSERTED',
    DELETED = 'DELETED',
}

export interface Diff {
    type: DiffType;
    words: MatchedWord[];
}

export interface TranscriptParagraph {
    words: MatchedWord[];
    startingWordIndex: number;
    endingWordIndex: number;
}

export interface ShortcutConfig {
    playPause: string;
    rewind: string;
    forward: string;
    undo: string;
    redo: string;
    interpolateEdits: string;
    toggleLineNumbers: string;
    find: string;
    replace: string;
    driftForward: string;
    driftBackward: string;
}

export interface TranscriptViewHandle {
    insertTimestampAtCursor: (time: number) => void;
    insertSegmentTimestamp: (time: number, speakerLabel: string) => void;
    scrollToWord: (wordIndex: number) => void;
}


// --- CONTEXT TYPES ---

export interface DataContextType {
    audioFile: File | null;
    audioSrc: string | null;
    audioRef: React.RefObject<HTMLAudioElement>;
    audioFileName: string | null;
    mfaData: MatchedWord[] | null;
    mfaApplied: boolean;
    whisperData: MatchedWord[] | null;
    whisperApplied: boolean;
    transcriptVersions: TranscriptVersion[];
    // FIX: Add setTranscriptVersions to the context type to allow chat context to create new versions.
    setTranscriptVersions: React.Dispatch<React.SetStateAction<TranscriptVersion[]>>;
    currentVersionIndex: number;
    // FIX: Update setCurrentVersionIndex to allow functional updates, resolving an error in ChatContext.
    setCurrentVersionIndex: React.Dispatch<React.SetStateAction<number>>;
    diarizationSegments: DiarizationSegment[];
    speakerMap: SpeakerMap;
    currentTranscript: MatchedWord[];
    handleAudioUpload: (file: File) => void;
    handleMfaUpload: (file: File) => void;
    handleWhisperUpload: (file: File) => void;
    handlePyannoteUpload: (file: File) => void;
    handleApplyMfaTimestamps: () => void;
    handleApplyWhisperTimestamps: () => void;
    handleInterpolateEdits: () => void;
    handleTranscriptPaste: (text: string) => void;
    handleFormattedTranscriptUpload: (file: File) => void;
    handleSpeakerMapUpdate: (newMap: SpeakerMap) => void;
    handleSpeakerMerge: (from: string, to: string) => void;
    handleReplaceAllSpeakerLabels: (from: string, to: string) => void;
    handleReplaceSelectedSpeakerLabels: (indices: number[], to: string) => void;
    handleReset: () => void;
    // Granular history actions
    setTranscript: (words: MatchedWord[]) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    formattedTranscriptApplied: boolean;
    isDirty: boolean;
    driftOffset: number;
    setDriftOffset: React.Dispatch<React.SetStateAction<number>>;
    applyDriftCorrection: () => void;
}

export interface UIContextType {
    leftSidebarOpen: boolean;
    // FIX: Update state setters to allow functional updates, resolving errors in Header.tsx.
    setLeftSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
    chatOpen: boolean;
    setChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isSettingsOpen: boolean;
    setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isSpeakerEditorOpen: boolean;
    setIsSpeakerEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isTextSpeakerEditorOpen: boolean;
    setIsTextSpeakerEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isTimelineVisible: boolean;
    setIsTimelineVisible: React.Dispatch<React.SetStateAction<boolean>>;
    isLineNumbersVisible: boolean;
    setIsLineNumbersVisible: React.Dispatch<React.SetStateAction<boolean>>;
    timelineZoom: number;
    setTimelineZoom: (zoom: number) => void;
    textZoom: number;
    setTextZoom: (zoom: number) => void;
    volume: number;
    setVolume: (volume: number) => void;
    lastPlaybackTime: number;
    setLastPlaybackTime: (time: number) => void;
    shortcuts: ShortcutConfig;
    updateShortcuts: (newShortcuts: ShortcutConfig) => void;
    currentTab: 'editor' | 'virtual' | 'gemini' | 'gpt4o';
    setCurrentTab: React.Dispatch<React.SetStateAction<'editor' | 'virtual' | 'gemini' | 'gpt4o'>>;
    findQuery: string;
    setFindQuery: React.Dispatch<React.SetStateAction<string>>;
    replaceQuery: string;
    setReplaceQuery: React.Dispatch<React.SetStateAction<string>>;
    findReplaceVisible: boolean;
    setFindReplaceVisible: React.Dispatch<React.SetStateAction<boolean>>;
    activeMatchIndex: number;
    setActiveMatchIndex: React.Dispatch<React.SetStateAction<number>>;
    findNext: () => void;
    replaceNext: () => void;
    closeFindReplace: () => void;
}

export interface ChatContextType {
    chatHistory: { role: 'user' | 'model'; text: string }[];
    systemPrompt: string;
    setSystemPrompt: (prompt: string) => void;
    isLoading: boolean;
    loadingMessage: string;
    handleTranscriptionRequest: (prompt: string) => Promise<void>;
    handleEditRequest: () => Promise<void>;
}
