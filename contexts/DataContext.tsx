import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { MatchedWord, DiarizationSegment, SpeakerMap, TranscriptVersion, DataContextType } from '../types';
import { 
    parsePyannote, parseMfa, interpolateTimestamps, parsePastedTranscript, 
    parseWhisperJson, alignAndApplyTimestamps,
    parseFormattedTranscript, stripSpeakerTags, reconstructSpeakerTags, SpeakerTagInfo
} from '../services/processingService';

const DataContext = createContext<DataContextType | null>(null);

export const useData = () => {
    const context = useContext(DataContext);
    if (!context) throw new Error('useData must be used within a DataProvider');
    return context;
};

const loadInitialState = () => {
    try {
        const savedStateJSON = localStorage.getItem('autosave-data-state');
        if (savedStateJSON) return JSON.parse(savedStateJSON);
    } catch (e) {
        console.error("Could not parse saved data state", e);
    }
    return null;
};

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const initialSavedState = useRef(loadInitialState()).current;
    
    const [driftOffset, setDriftOffset] = useState<number>(0);
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [audioSrc, setAudioSrc] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [audioFileName, setAudioFileName] = useState<string | null>(initialSavedState?.audioFileName || null);
    
    const [mfaData, setMfaData] = useState<MatchedWord[] | null>(null);
    const [mfaApplied, setMfaApplied] = useState(initialSavedState?.mfaApplied ?? false);
    const [whisperData, setWhisperData] = useState<MatchedWord[] | null>(null);
    const [whisperApplied, setWhisperApplied] = useState(initialSavedState?.whisperApplied ?? false);

    const [transcriptVersions, setTranscriptVersions] = useState<TranscriptVersion[]>(initialSavedState?.transcriptVersions || []);
    const [currentVersionIndex, setCurrentVersionIndex] = useState<number>(initialSavedState?.currentVersionIndex || 0);

    const [diarizationSegments, setDiarizationSegments] = useState<DiarizationSegment[]>(initialSavedState?.diarizationSegments || []);
    const [speakerMap, setSpeakerMap] = useState<SpeakerMap>(initialSavedState?.speakerMap || {});
    
    const [currentTranscript, setTranscript] = useState<MatchedWord[]>([]); // This holds the live, "dirty" state of the transcript being edited.
    const [formattedTranscriptApplied, setFormattedTranscriptApplied] = useState(initialSavedState?.formattedTranscriptApplied ?? false);
    
    // Store speaker tags from formatted transcript for reconstruction after alignment
    const [originalSpeakerTags, setOriginalSpeakerTags] = useState<SpeakerTagInfo[]>([]);

    // Effect to load the words from the current version into the editable state
    useEffect(() => {
        const words = transcriptVersions[currentVersionIndex]?.words || [];
        setTranscript(words);
    }, [currentVersionIndex, transcriptVersions, currentTranscript]);

    useEffect(() => {
        const stateToSave = {
            audioFileName, mfaApplied, whisperApplied, transcriptVersions,
            currentVersionIndex, diarizationSegments, speakerMap, formattedTranscriptApplied,
        };
        localStorage.setItem('autosave-data-state', JSON.stringify(stateToSave));
    }, [audioFileName, mfaApplied, whisperApplied, transcriptVersions, currentVersionIndex, diarizationSegments, speakerMap, formattedTranscriptApplied]);

    const handleAudioUpload = useCallback((file: File) => {
        setAudioFile(file);
        setAudioSrc(URL.createObjectURL(file));
        setAudioFileName(file.name);
        setTranscriptVersions([]);
        setDiarizationSegments([]);
        setSpeakerMap({});
        setMfaData(null);
        setMfaApplied(false);
        setWhisperData(null);
        setWhisperApplied(false);
        setFormattedTranscriptApplied(false);
    }, []);

    const handleMfaUpload = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = JSON.parse(e.target?.result as string);
                const words = parseMfa(content);
                if (transcriptVersions.length === 0) {
                    const newVersion: TranscriptVersion = { name: `MFA Upload (v1)`, words };
                    setTranscriptVersions([newVersion]);
                    setCurrentVersionIndex(0);
                } else {
                    setTranscript(words);
                }
                setMfaApplied(true);
            } catch (error) { alert("Invalid MFA JSON file."); }
        };
        reader.readAsText(file);
    }, [transcriptVersions.length, currentVersionIndex]);

    const handleWhisperUpload = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = JSON.parse(e.target?.result as string);
                const words = parseWhisperJson(content);
                if (transcriptVersions.length === 0) {
                    const newVersion: TranscriptVersion = { name: `Whisper Upload (v1)`, words };
                    setTranscriptVersions([newVersion]);
                    setCurrentVersionIndex(0);
                } else {
                    setTranscript(words);
                }
                setWhisperApplied(true);
            } catch (error) { alert(`Invalid Whisper JSON file: ${error.message}`); }
        };
        reader.readAsText(file);
    }, [transcriptVersions.length, currentVersionIndex]);
    
    const handleApplyMfaTimestamps = useCallback(() => {
        // This function is now deprecated as MFA files are loaded directly.
    }, []);

    const handleApplyWhisperTimestamps = useCallback(() => {
        // This function is now deprecated as Whisper files are loaded directly.
    }, []);

    const handlePyannoteUpload = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const { segments, speakerMap } = parsePyannote(JSON.parse(e.target?.result as string));
                setDiarizationSegments(segments);
                setSpeakerMap(speakerMap);
            } catch (error) { alert("Invalid Pyannote JSON file."); }
        };
        reader.readAsText(file);
    }, []);

    const isDirty = useMemo(() => {
        const previousVersionWords = transcriptVersions[currentVersionIndex]?.words || [];
        // A simple but effective deep comparison for this data structure.
        return JSON.stringify(currentTranscript) !== JSON.stringify(previousVersionWords);
    }, [currentTranscript, transcriptVersions, currentVersionIndex]);

    const handleInterpolateEdits = useCallback(() => {
        if (!isDirty) return; // Do nothing if there are no changes.

        const renumbered = currentTranscript.map((word, i) => ({ ...word, number: i + 1 }));
        const finalTranscript = interpolateTimestamps(renumbered);
        const newVersion: TranscriptVersion = {
            name: `Interpolated Edits (v${transcriptVersions.length + 1})`,
            words: finalTranscript
        };
        const newVersions = [...transcriptVersions.slice(0, currentVersionIndex + 1), newVersion];
        setTranscriptVersions(newVersions);
        setCurrentVersionIndex(newVersions.length - 1);
    }, [currentTranscript, transcriptVersions, currentVersionIndex, isDirty]);

    const handleTranscriptPaste = useCallback((text: string) => {
        try {
            // Check if the text contains speaker tags
            const hasSpeakerTags = /(?:^|\n)(?:(?:\d{2}:){1,2}\d{2}[.,]\d+\s+)?(?:S\d+|S\?|Speaker\s*\d+|[A-Z][a-zA-Z\s]*?):\s/m.test(text);
            
            let pastedWords: MatchedWord[];
            
            if (hasSpeakerTags) {
                // Parse as formatted transcript with speaker tags
                const { words, speakerTags } = parseFormattedTranscript(text);
                pastedWords = words;
                setOriginalSpeakerTags(speakerTags); // Store for later reconstruction
            } else {
                // Parse as simple transcript
                pastedWords = parsePastedTranscript(text);
                setOriginalSpeakerTags([]); // Clear any previous speaker tags
            }
            
            if (pastedWords.length > 0) {
                if (transcriptVersions.length === 0) {
                    const newVersion: TranscriptVersion = { name: `Uploaded Transcript (v1)`, words: pastedWords };
                    setTranscriptVersions([newVersion]);
                    setCurrentVersionIndex(0);
                } else {
                    setTranscript(pastedWords);
                }
            }
        } catch (error) { alert("Could not parse the pasted text."); }
    }, [transcriptVersions.length]);

    const handleFormattedTranscriptUpload = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => handleTranscriptPaste(e.target?.result as string);
        reader.readAsText(file);
        setFormattedTranscriptApplied(true);
    }, [handleTranscriptPaste]);

    const handleSpeakerMapUpdate = useCallback((newSpeakerMap: SpeakerMap) => setSpeakerMap(newSpeakerMap), []);
    const handleSpeakerMerge = useCallback((fromSpeakerId: string, toSpeakerId: string) => {
        setDiarizationSegments(segs => segs.map(seg => seg.speaker === fromSpeakerId ? { ...seg, speaker: toSpeakerId } : seg));
        setSpeakerMap(sMap => { const newMap = { ...sMap }; delete newMap[fromSpeakerId]; return newMap; });
    }, []);

    const handleReplaceAllSpeakerLabels = useCallback((fromLabel: string, toLabel: string) => {
        if (!fromLabel || !toLabel || fromLabel === toLabel) return;
        const updated = currentTranscript.map(w => w.speakerLabel === fromLabel ? { ...w, speakerLabel: toLabel } : w);
        if (JSON.stringify(updated) !== JSON.stringify(currentTranscript)) setTranscript(updated);
    }, [currentTranscript]);

    const handleReplaceSelectedSpeakerLabels = useCallback((indicesToUpdate: number[], toLabel: string) => {
        if (indicesToUpdate.length === 0 || !toLabel) return;
        const updated = [...currentTranscript.map(w => ({...w}))];
        indicesToUpdate.forEach(index => { if (updated[index]) updated[index].speakerLabel = toLabel; });
        setTranscript(updated);
    }, [currentTranscript]);

    const handleReset = useCallback(() => {
        setAudioFile(null);
        setAudioSrc(null);
        if (audioRef.current) {
            audioRef.current.src = '';
            audioRef.current.removeAttribute('src');
            audioRef.current.load();
        }
        setTranscriptVersions([]);
        setCurrentVersionIndex(0);
        setDiarizationSegments([]);
        setSpeakerMap({});
        setMfaData(null);
        setMfaApplied(false);
        setWhisperData(null);
        setWhisperApplied(false);
        setAudioFileName(null);
        setFormattedTranscriptApplied(false);
        localStorage.removeItem('autosave-data-state');
    }, []);

    const undo = useCallback(() => {
        setCurrentVersionIndex(prev => Math.max(0, prev - 1));
    }, []);

    const redo = useCallback(() => {
        setCurrentVersionIndex(prev => Math.min(transcriptVersions.length - 1, prev + 1));
    }, [transcriptVersions.length]);

    const canUndo = currentVersionIndex > 0;
    const canRedo = currentVersionIndex < transcriptVersions.length - 1;

    const applyDriftCorrection = useCallback((startTime?: number) => {
        if (driftOffset === 0) return;

        const correctedTranscript = currentTranscript.map(word => {
            if (word.start !== null && (startTime === undefined || word.start >= startTime)) {
                return {
                    ...word,
                    start: word.start + driftOffset,
                    end: word.end !== null ? word.end + driftOffset : null,
                };
            }
            return word;
        });

        const newVersion: TranscriptVersion = {
            name: `Drift Corrected (v${transcriptVersions.length + 1})`,
            words: correctedTranscript
        };
        const newVersions = [...transcriptVersions.slice(0, currentVersionIndex + 1), newVersion];
        setTranscriptVersions(newVersions);
        setCurrentVersionIndex(newVersions.length - 1);
        setDriftOffset(0);
    }, [currentTranscript, driftOffset, transcriptVersions, currentVersionIndex]);

    const value: DataContextType = {
        audioFile, audioSrc, audioRef, audioFileName, mfaData, mfaApplied, whisperData, whisperApplied,
        transcriptVersions, setTranscriptVersions, currentVersionIndex, setCurrentVersionIndex, diarizationSegments, speakerMap,
        currentTranscript, handleAudioUpload, handleMfaUpload, handleWhisperUpload,
        handlePyannoteUpload, handleApplyMfaTimestamps, handleApplyWhisperTimestamps, handleInterpolateEdits,
        handleTranscriptPaste, handleFormattedTranscriptUpload, handleSpeakerMapUpdate, handleSpeakerMerge,
        handleReplaceAllSpeakerLabels, handleReplaceSelectedSpeakerLabels, handleReset,
        setTranscript, undo, redo, canUndo, canRedo, formattedTranscriptApplied, isDirty,
        driftOffset, setDriftOffset, applyDriftCorrection,
    };

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
