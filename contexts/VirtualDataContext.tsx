import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { MatchedWord, DiarizationSegment, SpeakerMap, TranscriptVersion, DataContextType } from '../types';
import { 
    parsePyannote, parseMfa, interpolateTimestamps, parsePastedTranscript, 
    parseWhisperJson, alignAndApplyTimestamps, advancedWordMatching,
    parseFormattedTranscript, stripSpeakerTags, reconstructSpeakerTags, SpeakerTagInfo,
    addSpeakerSeparationLines 
} from '../services/processingService';

const VirtualDataContext = createContext<DataContextType | null>(null);

export const useVirtualData = () => {
    const context = useContext(VirtualDataContext);
    if (!context) throw new Error('useVirtualData must be used within a VirtualDataProvider');
    return context;
};

const loadInitialState = () => {
    try {
        const savedStateJSON = localStorage.getItem('autosave-virtual-data-state');
        if (savedStateJSON) return JSON.parse(savedStateJSON);
    } catch (e) {
        console.error("Could not parse saved virtual data state", e);
    }
    return null;
};

export const VirtualDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const initialSavedState = useRef(loadInitialState()).current;
    
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

    // Derived state
    const currentVersion = useMemo(() => {
        return transcriptVersions[currentVersionIndex] || null;
    }, [transcriptVersions, currentVersionIndex]);

    const isDirty = useMemo(() => {
        if (!currentVersion) return currentTranscript.length > 0;
        if (currentVersion.words.length !== currentTranscript.length) return true;
        return currentVersion.words.some((word, index) => {
            const current = currentTranscript[index];
            return current && (
                word.punctuated_word !== current.punctuated_word ||
                word.speakerLabel !== current.speakerLabel ||
                word.isParagraphStart !== current.isParagraphStart
            );
        });
    }, [currentVersion, currentTranscript]);

    const canUndo = currentVersionIndex > 0;
    const canRedo = currentVersionIndex < transcriptVersions.length - 1;

    // Auto-save state to localStorage
    useEffect(() => {
        const stateToSave = {
            audioFileName,
            transcriptVersions,
            currentVersionIndex,
            mfaApplied,
            whisperApplied,
            diarizationSegments,
            speakerMap,
            formattedTranscriptApplied,
        };
        localStorage.setItem('autosave-virtual-data-state', JSON.stringify(stateToSave));
    }, [audioFileName, transcriptVersions, currentVersionIndex, mfaApplied, whisperApplied, diarizationSegments, speakerMap, formattedTranscriptApplied]);

    // Load current version into live transcript when version changes
    useEffect(() => {
        if (currentVersion) {
            setTranscript([...currentVersion.words]);
        } else {
            setTranscript([]);
        }
    }, [currentVersion]);

    const handleAudioUpload = useCallback((file: File) => {
        setAudioFile(file);
        const url = URL.createObjectURL(file);
        setAudioSrc(url);
        setAudioFileName(file.name);
    }, []);

    const handleMfaUpload = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const jsonData = JSON.parse(e.target?.result as string);
                const words = parseMfa(jsonData);
                setMfaData(words);
                console.log('Virtual MFA data uploaded:', words.length, 'words');
            } catch (error) {
                console.error('Error parsing virtual MFA file:', error);
                alert('Invalid MFA JSON file');
            }
        };
        reader.readAsText(file);
    }, []);

    const handleWhisperUpload = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const jsonData = JSON.parse(e.target?.result as string);
                const words = parseWhisperJson(jsonData);
                setWhisperData(words);
                console.log('Virtual Whisper data uploaded:', words.length, 'words');
            } catch (error) {
                console.error('Error parsing virtual Whisper file:', error);
                alert('Invalid Whisper JSON file');
            }
        };
        reader.readAsText(file);
    }, []);

    const handlePyannoteUpload = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const jsonData = JSON.parse(e.target?.result as string);
                const { segments, speakerMap } = parsePyannote(jsonData);
                setDiarizationSegments(segments);
                setSpeakerMap(speakerMap);
                
                console.log('Virtual Pyannote data uploaded:', segments.length, 'segments');
            } catch (error) {
                console.error('Error parsing virtual Pyannote file:', error);
                alert('Invalid Pyannote JSON file');
            }
        };
        reader.readAsText(file);
    }, []);

    const handleFormattedTranscriptUpload = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const { words, speakerTags } = parseFormattedTranscript(text);
                
                setOriginalSpeakerTags(speakerTags);
                
                const newVersions = [{
                    name: 'Uploaded Transcript',
                    words: words
                }];
                
                setTranscriptVersions(newVersions);
                setCurrentVersionIndex(0);
                setFormattedTranscriptApplied(true);
                
                console.log('Virtual formatted transcript uploaded:', words.length, 'words');
            } catch (error) {
                console.error('Error parsing virtual formatted transcript:', error);
                alert('Error parsing formatted transcript file');
            }
        };
        reader.readAsText(file);
    }, []);

    const handleApplyMfaTimestamps = useCallback(() => {
        if (!mfaData || currentTranscript.length === 0) {
            alert('No MFA data or transcript available');
            return;
        }

        try {
            let alignedWords = alignAndApplyTimestamps(currentTranscript, mfaData);
            
            // Add empty lines between speaker paragraphs for better visual separation
            alignedWords = addSpeakerSeparationLines(alignedWords);
            
            const newVersions = [
                ...transcriptVersions.slice(0, currentVersionIndex + 1),
                { name: 'MFA Applied', words: alignedWords }
            ];
            
            setTranscriptVersions(newVersions);
            setCurrentVersionIndex(newVersions.length - 1);
            setMfaApplied(true);
            setMfaData(null); // Clear MFA data after processing
            
            console.log('Virtual MFA timestamps applied');
        } catch (error) {
            console.error('Error applying virtual MFA timestamps:', error);
            alert('Error applying MFA timestamps');
        }
    }, [mfaData, currentTranscript, transcriptVersions, currentVersionIndex]);

    const handleApplyWhisperTimestamps = useCallback(() => {
        if (!whisperData || currentTranscript.length === 0) {
            alert('No Whisper data or transcript available');
            return;
        }

        try {
            let alignedWords = alignAndApplyTimestamps(currentTranscript, whisperData);
            
            // Add empty lines between speaker paragraphs for better visual separation
            alignedWords = addSpeakerSeparationLines(alignedWords);
            
            const newVersions = [
                ...transcriptVersions.slice(0, currentVersionIndex + 1),
                { name: 'Whisper Applied', words: alignedWords }
            ];
            
            setTranscriptVersions(newVersions);
            setCurrentVersionIndex(newVersions.length - 1);
            setWhisperApplied(true);
            setWhisperData(null); // Clear Whisper data after processing
            
            console.log('Virtual Whisper timestamps applied');
        } catch (error) {
            console.error('Error applying virtual Whisper timestamps:', error);
            alert('Error applying Whisper timestamps');
        }
    }, [whisperData, currentTranscript, transcriptVersions, currentVersionIndex]);

    const handleInterpolateEdits = useCallback(() => {
        if (!isDirty) {
            alert('No changes to interpolate');
            return;
        }

        try {
            const interpolatedWords = interpolateTimestamps(currentTranscript);
            
            const newVersions = [
                ...transcriptVersions.slice(0, currentVersionIndex + 1),
                { name: 'Interpolated', words: interpolatedWords }
            ];
            
            setTranscriptVersions(newVersions);
            setCurrentVersionIndex(newVersions.length - 1);
            
            console.log('Virtual edits interpolated');
        } catch (error) {
            console.error('Error interpolating virtual edits:', error);
            alert('Error interpolating edits');
        }
    }, [isDirty, currentTranscript, transcriptVersions, currentVersionIndex]);

    const handleTranscriptPaste = useCallback((text: string) => {
        try {
            const words = parsePastedTranscript(text);
            
            const newVersions = [{
                name: 'Pasted Transcript',
                words: words
            }];
            
            setTranscriptVersions(newVersions);
            setCurrentVersionIndex(0);
            
            console.log('Virtual transcript pasted:', words.length, 'words');
        } catch (error) {
            console.error('Error parsing virtual pasted transcript:', error);
            alert('Error parsing pasted transcript');
        }
    }, []);

    const handleSpeakerMapUpdate = useCallback((newMap: SpeakerMap) => {
        setSpeakerMap(newMap);
    }, []);

    const handleSpeakerMerge = useCallback((from: string, to: string) => {
        const updatedTranscript = currentTranscript.map(word => ({
            ...word,
            speakerLabel: word.speakerLabel === from ? to : word.speakerLabel
        }));
        setTranscript(updatedTranscript);
    }, [currentTranscript]);

    const handleReplaceAllSpeakerLabels = useCallback((from: string, to: string) => {
        const updatedTranscript = currentTranscript.map(word => ({
            ...word,
            speakerLabel: word.speakerLabel === from ? to : word.speakerLabel
        }));
        setTranscript(updatedTranscript);
    }, [currentTranscript]);

    const handleReplaceSelectedSpeakerLabels = useCallback((indices: number[], to: string) => {
        const updatedTranscript = currentTranscript.map((word, index) => ({
            ...word,
            speakerLabel: indices.includes(index) ? to : word.speakerLabel
        }));
        setTranscript(updatedTranscript);
    }, [currentTranscript]);

    const handleReset = useCallback(() => {
        if (confirm('Are you sure you want to reset the virtual workspace? This will clear all data.')) {
            setAudioFile(null);
            setAudioSrc(null);
            setAudioFileName(null);
            setMfaData(null);
            setMfaApplied(false);
            setWhisperData(null);
            setWhisperApplied(false);
            setTranscriptVersions([]);
            setCurrentVersionIndex(0);
            setDiarizationSegments([]);
            setSpeakerMap({});
            setTranscript([]);
            setFormattedTranscriptApplied(false);
            setOriginalSpeakerTags([]);
            localStorage.removeItem('autosave-virtual-data-state');
        }
    }, []);

    const undo = useCallback(() => {
        if (canUndo) {
            setCurrentVersionIndex(prev => prev - 1);
        }
    }, [canUndo]);

    const redo = useCallback(() => {
        if (canRedo) {
            setCurrentVersionIndex(prev => prev + 1);
        }
    }, [canRedo]);

    const value: DataContextType = {
        driftOffset: 0,
        setDriftOffset: () => {},
        applyDriftCorrection: (startTime?: number) => {},
        audioFile,
        audioSrc,
        audioRef,
        audioFileName,
        mfaData,
        mfaApplied,
        whisperData,
        whisperApplied,
        transcriptVersions,
        setTranscriptVersions,
        currentVersionIndex,
        setCurrentVersionIndex,
        diarizationSegments,
        speakerMap,
        currentTranscript,
        handleAudioUpload,
        handleMfaUpload,
        handleWhisperUpload,
        handlePyannoteUpload,
        handleApplyMfaTimestamps,
        handleApplyWhisperTimestamps,
        handleInterpolateEdits,
        handleTranscriptPaste,
        handleFormattedTranscriptUpload,
        handleSpeakerMapUpdate,
        handleSpeakerMerge,
        handleReplaceAllSpeakerLabels,
        handleReplaceSelectedSpeakerLabels,
        handleReset,
        setTranscript,
        undo,
        redo,
        canUndo,
        canRedo,
        formattedTranscriptApplied,
        isDirty,
    };

    return (
        <VirtualDataContext.Provider value={value}>
            {children}
        </VirtualDataContext.Provider>
    );
};
