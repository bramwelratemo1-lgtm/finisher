import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TranscriptView, TranscriptViewHandle } from './TranscriptView';
import { CanvasTimeline as SpeakerTimeline } from './timeline/CanvasTimeline'; // Use the new Canvas-based timeline.
import { FileUpload } from './FileUpload';
import { FindReplaceBar } from './FindReplaceBar';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import { useLineHighlight } from '../contexts/LineHighlightContext';
import { LineHighlightConfig } from './LineHighlightConfig';
import { PlayIcon, PauseIcon, UploadCloudIcon, EyeIcon, EyeOffIcon, ClockIcon, ResetIcon, ZoomInIcon, ZoomOutIcon, Volume2Icon, Volume1Icon, VolumeXIcon, UndoIcon, RedoIcon, WandIcon, ListIcon, DownloadIcon, SearchIcon, HighlightIcon } from './icons/Icons';
import { formatTranscriptForExport } from '../services/processingService';
import type { DiarizationSegment } from '../types';

export const Editor: React.FC = () => {
    const {
        audioSrc, audioRef, currentTranscript, diarizationSegments, speakerMap,
        handleAudioUpload, handleMfaUpload, handleWhisperUpload, handlePyannoteUpload,
        handleFormattedTranscriptUpload, setTranscript, handleInterpolateEdits,
        handleTranscriptPaste, mfaData, handleApplyMfaTimestamps, mfaApplied,
        whisperData, handleApplyWhisperTimestamps, whisperApplied,
        handleReset, undo, redo, canUndo, canRedo, isDirty, formattedTranscriptApplied
    } = useData();

    const {
        isTimelineVisible, isLineNumbersVisible, timelineZoom, textZoom, volume, lastPlaybackTime, shortcuts,
        setIsTimelineVisible, setIsLineNumbersVisible, setTimelineZoom, setTextZoom, setVolume, setLastPlaybackTime
    } = useUI();

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [lastVolume, setLastVolume] = useState(1);
    // Removed timeToScrollTo - now using seekToTime directly

    // Find and Replace State
    const [isFindBarOpen, setIsFindBarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [replaceQuery, setReplaceQuery] = useState('');
    const [searchMatches, setSearchMatches] = useState<number[]>([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
    
    const [selectedSegment, setSelectedSegment] = useState<DiarizationSegment | null>(null);

    // Line highlighting state
    const [isHighlightConfigOpen, setIsHighlightConfigOpen] = useState(false);
    const highlightButtonRef = useRef<HTMLButtonElement>(null);
    
    // Font configuration state
    const [selectedFont, setSelectedFont] = useState('font-mono');
    const [isFontConfigOpen, setIsFontConfigOpen] = useState(false);
    const fontButtonRef = useRef<HTMLButtonElement>(null);

    const transcriptViewRef = useRef<TranscriptViewHandle>(null);

    const MIN_ZOOM = 0.25;
    const MAX_ZOOM = 50;
    const ZOOM_STEP = 1.5;

    const handleTimelineZoomIn = () => setTimelineZoom(Math.min(MAX_ZOOM, timelineZoom * ZOOM_STEP));
    const handleTimelineZoomOut = () => setTimelineZoom(Math.max(MIN_ZOOM, timelineZoom / ZOOM_STEP));
    const handleTextZoomIn = () => setTextZoom(Math.min(3, textZoom * 1.1));
    const handleTextZoomOut = () => setTextZoom(Math.max(0.5, textZoom / 1.1));
    
    const handleFindRequest = useCallback((query: string) => {
        setIsFindBarOpen(true);
        setSearchQuery(query);
    }, []);

    // Effect to find matches when search query or transcript changes
    useEffect(() => {
        if (!searchQuery) {
            setSearchMatches([]);
            setCurrentMatchIndex(-1);
            return;
        }

        const matches = currentTranscript.reduce((acc, word, index) => {
            if (word.punctuated_word.toLowerCase().includes(searchQuery.toLowerCase())) {
                acc.push(index);
            }
            return acc;
        }, [] as number[]);
        
        setSearchMatches(matches);
        setCurrentMatchIndex(matches.length > 0 ? 0 : -1);
    }, [searchQuery, currentTranscript]);


    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const setAudioData = () => {
            if (isFinite(audio.duration)) {
                setDuration(audio.duration);
            }
            if (lastPlaybackTime > 0 && lastPlaybackTime < (audio.duration || Infinity) && audio.currentTime === 0) {
                 audio.currentTime = lastPlaybackTime;
            }
            setCurrentTime(audio.currentTime);
        };
        const setAudioTime = () => {
            const time = audio.currentTime;
            setCurrentTime(time);
            setLastPlaybackTime(time);
        };
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);

        audio.addEventListener('loadeddata', setAudioData);
        audio.addEventListener('timeupdate', setAudioTime);
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onPause);
        
        // Check if data is already loaded
        if (audio.readyState >= 2) {
            setAudioData();
        }

        return () => {
            audio.removeEventListener('loadeddata', setAudioData);
            audio.removeEventListener('timeupdate', setAudioTime);
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('ended', onPause);
        };
    }, [audioRef, audioSrc, lastPlaybackTime, setLastPlaybackTime]);
    
    // Removed old timeToScrollTo effect - now using seekToTime directly


    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume, audioRef]);

    const handlePlayPause = () => {
        if (audioRef.current) {
            const audio = audioRef.current;
            if (audio.paused) {
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        // AbortError is expected if the user quickly pauses.
                        if (error.name !== 'AbortError') {
                            console.error('Audio playback failed:', error);
                        }
                    });
                }
            } else {
                audio.pause();
            }
        }
    };
    
    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        if (newVolume > 0) {
            setLastVolume(newVolume);
        }
    };
    
    const toggleMute = () => {
        if (volume > 0) {
            setLastVolume(volume);
            setVolume(0);
        } else {
            setVolume(lastVolume > 0 ? lastVolume : 1);
        }
    };

    const handleSeekToTime = (time: number | null) => {
        if (!audioRef.current || time === null || isNaN(time) || time < 0) {
            console.warn('Invalid audio seek request:', { audio: !!audioRef.current, time });
            return;
        }
        
        const audio = audioRef.current;
        
        // Ensure audio is loaded and ready
        if (audio.readyState < 2) {
            console.warn('Audio not ready for seeking, readyState:', audio.readyState);
            // Try again after a short delay
            setTimeout(() => handleSeekToTime(time), 100);
            return;
        }
        
        // Validate time is within bounds
        if (audio.duration && time > audio.duration) {
            console.warn('Seek time exceeds duration:', time, 'vs', audio.duration);
            time = audio.duration - 0.1; // Seek near end instead
        }
        
        try {
            audio.currentTime = time;
            
            // Auto-play on word click for better UX with improved reliability
            if (audio.paused) {
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise
                        .then(() => {
                            // Success - audio is playing
                        })
                        .catch(error => {
                            if (error.name !== 'AbortError') {
                                console.error('Audio playback failed on seek:', error);
                                // Try again after a brief pause
                                setTimeout(() => {
                                    if (audio.paused && audioRef.current === audio) {
                                        audio.play().catch(() => {}); // Silent retry
                                    }
                                }, 50);
                            }
                        });
                }
            }
        } catch (error) {
            console.error('Error during audio seek:', error);
        }
    };
    
    const handleSelectSegment = (segment: DiarizationSegment | null) => {
        setSelectedSegment(segment);
    };

    const handleTimelineSeek = (time: number) => {
        if (!audioRef.current) return;
        const audio = audioRef.current;
        audio.currentTime = time;
        // Auto-play on timeline click for better UX
        if (audio.paused) {
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    if (error.name !== 'AbortError') {
                        console.error('Audio playback failed on timeline seek:', error);
                    }
                });
            }
        }
        // Scroll transcript to the word at this time using new seekToTime method
        transcriptViewRef.current?.seekToTime(time);
    };
    
    const handleAddTimestamp = () => {
        // Add a small delay to ensure we don't conflict with any blur events
        setTimeout(() => {
            if (selectedSegment) {
                const speakerLabel = speakerMap[selectedSegment.speaker]?.name;
                if (speakerLabel) {
                    transcriptViewRef.current?.insertSegmentTimestamp(selectedSegment.start, speakerLabel);
                    setSelectedSegment(null); // Deselect after use for better UX
                }
            } else {
                transcriptViewRef.current?.insertTimestampAtCursor(currentTime);
            }
        }, 0); // Minimal delay to let any pending events settle
    };

    const handleExport = () => {
        if (currentTranscript.length === 0) {
            alert("No transcript to export.");
            return;
        }
        const formattedText = formatTranscriptForExport(currentTranscript);
        const blob = new Blob([formattedText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'transcript.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    const handleNextMatch = () => {
        if (searchMatches.length > 0) {
            setCurrentMatchIndex((prev) => (prev + 1) % searchMatches.length);
        }
    };
    
    const handlePrevMatch = () => {
        if (searchMatches.length > 0) {
            setCurrentMatchIndex((prev) => (prev - 1 + searchMatches.length) % searchMatches.length);
        }
    };

    const activeMatchGlobalIndex = searchMatches[currentMatchIndex] ?? -1;
    
    const handleReplace = useCallback(() => {
        if (activeMatchGlobalIndex === -1) return;

        const newTranscript = [...currentTranscript];
        newTranscript[activeMatchGlobalIndex] = {
            ...newTranscript[activeMatchGlobalIndex],
            punctuated_word: replaceQuery,
            cleaned_word: replaceQuery.toLowerCase().replace(/[.,!?]/g, ''),
        };
        
        // Filter out the word if it becomes empty, effectively deleting it.
        const finalTranscript = newTranscript.filter(w => w.punctuated_word.trim() !== '');
        setTranscript(finalTranscript);
        // The useEffect on currentTranscript will re-run the search and reset the index.
    }, [activeMatchGlobalIndex, replaceQuery, currentTranscript, setTranscript]);

    const handleReplaceAll = useCallback(() => {
        if (!searchQuery) return;

        const newTranscript = currentTranscript
            .map(word => {
                if (word.punctuated_word.toLowerCase().includes(searchQuery.toLowerCase())) {
                    return {
                        ...word,
                        punctuated_word: replaceQuery,
                        cleaned_word: replaceQuery.toLowerCase().replace(/[.,!?]/g, ''),
                    };
                }
                return word;
            })
            // Filter out any words that become empty from the replacement.
            .filter(w => w.punctuated_word.trim() !== '');

        setTranscript(newTranscript);
        // After replacing all, close the find bar as the search is now invalid.
        setIsFindBarOpen(false);
        setSearchQuery('');
        setReplaceQuery('');
    }, [searchQuery, replaceQuery, currentTranscript, setTranscript]);
    
    const handleEditStart = useCallback(() => {
        // Auto-pause on edit start for better focus
        if (audioRef.current && !audioRef.current.paused) {
            audioRef.current.pause();
        }
    }, [audioRef]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target.isContentEditable && !target.closest('.transcript-editor-view'))) return;

            const parts: string[] = [];
            if (e.ctrlKey) parts.push('Control');
            if (e.metaKey) parts.push('Meta');
            if (e.altKey) parts.push('Alt');
            if (e.shiftKey) parts.push('Shift');
            
            const key = e.key === ' ' ? ' ' : e.key;
            if (!['Control', 'Meta', 'Alt', 'Shift'].includes(key)) parts.push(key);
            
            const keySignatureLower = parts.join('+').toLowerCase();

            const shortcutMap: { [key: string]: () => void } = {
                [shortcuts.playPause.toLowerCase()]: handlePlayPause,
                [shortcuts.rewind.toLowerCase()]: () => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 3); },
                [shortcuts.forward.toLowerCase()]: () => { if (audioRef.current) audioRef.current.currentTime = Math.min(audioRef.current.duration || Infinity, audioRef.current.currentTime + 3); },
                // Removed line numbers functionality
                [shortcuts.undo.toLowerCase()]: undo,
                [shortcuts.redo.toLowerCase()]: redo,
                [shortcuts.interpolateEdits.toLowerCase()]: handleInterpolateEdits,
            };

            if (shortcutMap[keySignatureLower]) {
                e.preventDefault();
                shortcutMap[keySignatureLower]();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcuts, handlePlayPause, audioRef, undo, redo, handleInterpolateEdits]);

    // Close font dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (fontButtonRef.current && !fontButtonRef.current.contains(event.target as Node)) {
                setIsFontConfigOpen(false);
            }
        };
        
        if (isFontConfigOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isFontConfigOpen]);

    const VolumeIcon = () => {
        if (volume === 0) return <VolumeXIcon className="w-5 h-5 text-gray-400" />;
        if (volume < 0.5) return <Volume1Icon className="w-5 h-5 text-gray-400" />;
        return <Volume2Icon className="w-5 h-5 text-gray-400" />;
    };
    
    if (!audioSrc) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-800/50 p-8">
                 <div className="text-center p-12 border-2 border-dashed border-gray-600 rounded-xl">
                    <UploadCloudIcon className="w-16 h-16 mx-auto text-gray-500" />
                    <h2 className="mt-4 text-2xl font-semibold text-gray-300">Upload Audio to Begin</h2>
                    <p className="mt-2 text-gray-400">Start your transcription workflow by uploading an audio file.</p>
                    <div className="mt-6">
                        <FileUpload onFileUpload={handleAudioUpload} accept="audio/*">
                            <span className="bg-brand-blue hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors cursor-pointer">
                                Select Audio File
                            </span>
                        </FileUpload>
                    </div>
                </div>
            </div>
        )
    }

    const canInterpolate = isDirty && (mfaApplied || whisperApplied);

    return (
        <div className="flex-1 flex flex-col bg-gray-800/50 overflow-hidden p-4 gap-4 relative">
             <div className="bg-gray-800 rounded-lg shadow-lg flex flex-col">
                {isTimelineVisible && (
                    <div className="p-4">
                        <SpeakerTimeline
                            segments={diarizationSegments}
                            speakerMap={speakerMap}
                            duration={duration}
                            currentTime={currentTime}
                            onSeek={handleTimelineSeek}
                            zoomLevel={timelineZoom}
                            selectedSegment={selectedSegment}
                            onSelectSegment={handleSelectSegment}
                        />
                    </div>
                )}
                 <div className={`flex items-center gap-4 px-4 pb-3 pt-3 ${isTimelineVisible ? 'border-t border-gray-700/50' : ''}`}>
                    <button onClick={handlePlayPause} className="p-2 bg-brand-blue rounded-full text-white hover:bg-blue-600 transition-colors">
                        {isPlaying ? <PauseIcon className="w-6 h-6"/> : <PlayIcon className="w-6 h-6"/>}
                    </button>
                    <div className="text-sm font-mono text-gray-400">
                        {new Date(currentTime * 1000).toISOString().substr(14, 5)} / {duration ? new Date(duration * 1000).toISOString().substr(14, 5) : '00:00'}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                        <button onClick={toggleMute} className="p-1 rounded-full hover:bg-gray-700" title={volume > 0 ? "Mute" : "Unmute"}>
                           <VolumeIcon />
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={handleVolumeChange}
                            className="w-24 h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-brand-blue"
                        />
                    </div>
                    <audio ref={audioRef} src={audioSrc} className="hidden" />
                    
                    {/* Timeline Zoom */}
                    <div className="flex items-center gap-1 bg-gray-900/50 rounded-full px-2 ml-4">
                       <span className="text-xs font-semibold text-gray-400 ml-1">Timeline</span>
                       <button onClick={handleTimelineZoomOut} disabled={timelineZoom <= MIN_ZOOM} className="p-1 rounded-full hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Zoom Out Timeline">
                           <ZoomOutIcon className="w-5 h-5 text-gray-400"/>
                       </button>
                       <span
                           className="text-xs font-mono text-gray-400 w-14 text-center cursor-pointer hover:text-white"
                           title="Reset Timeline Zoom"
                           onClick={() => setTimelineZoom(1)}
                       >
                           {Math.round(timelineZoom * 100)}%
                       </span>
                       <button onClick={handleTimelineZoomIn} disabled={timelineZoom >= MAX_ZOOM} className="p-1 rounded-full hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Zoom In Timeline">
                           <ZoomInIcon className="w-5 h-5 text-gray-400"/>
                       </button>
                       <div className="w-px h-4 bg-gray-700 mx-1"></div>
                       <button onClick={() => setIsTimelineVisible(!isTimelineVisible)} className="p-1 rounded-full hover:bg-gray-700 transition-colors" title={isTimelineVisible ? "Hide Timeline" : "Show Timeline"}>
                           {isTimelineVisible ? <EyeOffIcon className="w-5 h-5 text-gray-400"/> : <EyeIcon className="w-5 h-5 text-gray-400"/>}
                       </button>
                   </div>
                   
                    {/* Text Zoom */}
                    <div className="flex items-center gap-1 bg-gray-900/50 rounded-full px-2 ml-2">
                        <span className="text-xs font-semibold text-gray-400 ml-1">Text</span>
                        <button onClick={handleTextZoomOut} className="p-1 rounded-full hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Zoom Out Text">
                            <ZoomOutIcon className="w-5 h-5 text-gray-400" />
                        </button>
                        <span className="text-xs font-mono text-gray-400 w-14 text-center cursor-pointer hover:text-white" title="Reset Text Zoom" onClick={() => setTextZoom(1)}>
                            {Math.round(textZoom * 100)}%
                        </span>
                        <button onClick={handleTextZoomIn} className="p-1 rounded-full hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Zoom In Text">
                            <ZoomInIcon className="w-5 h-5 text-gray-400" />
                        </button>
                        <div className="w-px h-4 bg-gray-700 mx-1"></div>
                        {/* Removed line numbers button - using GPT-4o style interface */}
                       <div className="relative">
                           <button 
                               ref={highlightButtonRef}
                               onClick={() => setIsHighlightConfigOpen(!isHighlightConfigOpen)} 
                               className="p-1 rounded-full hover:bg-gray-700 transition-colors" 
                               title="Configure Line Highlighting"
                           >
                               <HighlightIcon className={`w-5 h-5 ${isHighlightConfigOpen ? 'text-brand-blue' : 'text-gray-400'}`}/>
                           </button>
                           <LineHighlightConfig 
                               isOpen={isHighlightConfigOpen}
                               onClose={() => setIsHighlightConfigOpen(false)}
                               anchorRef={highlightButtonRef}
                           />
                       </div>
                       <div className="w-px h-4 bg-gray-700 mx-1"></div>

                       {/* Simple System Font Configuration */}
                       <div className="relative">
                           <button 
                               ref={fontButtonRef}
                               onClick={() => setIsFontConfigOpen(!isFontConfigOpen)} 
                               className="p-1 rounded-full hover:bg-gray-700 transition-colors" 
                               title="Configure Font"
                           >
                               <span className={`text-xs font-bold ${isFontConfigOpen ? 'text-brand-blue' : 'text-gray-400'}`}>Aa</span>
                           </button>
                           {isFontConfigOpen && (
                               <div className="absolute top-full mt-2 right-0 bg-gray-700 border border-gray-600 rounded-md shadow-lg p-2 text-sm min-w-48 z-50">
                                   <div className="text-gray-300 font-semibold mb-2">Font Family</div>
                                   <div className="space-y-1">
                                       {[
                                           { value: 'font-mono', label: 'Monospace' },
                                           { value: 'font-sans', label: 'Inter/System Sans' },
                                           { value: 'font-serif', label: 'Times/System Serif' }
                                       ].map((font) => (
                                           <button
                                               key={font.value}
                                               onClick={() => {
                                                   setSelectedFont(font.value);
                                                   setIsFontConfigOpen(false);
                                               }}
                                               className={`w-full text-left px-3 py-2 rounded hover:bg-gray-600 transition-colors ${
                                                   selectedFont === font.value ? 'bg-brand-blue text-white' : 'text-gray-300'
                                               } ${font.value}`}
                                           >
                                               {font.label}
                                           </button>
                                       ))}
                                   </div>
                               </div>
                           )}
                       </div>

                    </div>

                    <button
                        onClick={() => setIsFindBarOpen(!isFindBarOpen)}
                        className={`p-2 ml-4 rounded-md hover:bg-gray-600 transition-colors flex items-center gap-2 text-sm ${isFindBarOpen ? 'bg-brand-blue/50 text-white' : 'bg-gray-700 text-gray-300'}`}
                        title="Find and Replace in transcript"
                    >
                        <SearchIcon className="w-5 h-5" />
                    </button>

                    <button
                        onMouseDown={(e) => {
                            // Prevent the textarea from losing focus (preventing blur)
                            e.preventDefault();
                        }}
                        onClick={handleAddTimestamp}
                        className={`p-2 ml-2 rounded-md transition-colors flex items-center gap-2 text-sm ${
                            selectedSegment
                                ? 'bg-brand-green hover:bg-green-600 text-white'
                                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        }`}
                        title={
                            selectedSegment && speakerMap[selectedSegment.speaker]
                                ? `Insert timestamp for ${speakerMap[selectedSegment.speaker].name} at ${new Date(selectedSegment.start * 1000).toISOString().substr(14, 5)}`
                                : "Insert current timestamp at cursor"
                        }
                    >
                        <ClockIcon className="w-5 h-5"/>
                    </button>
                    
                     <button
                        onClick={handleInterpolateEdits}
                        disabled={!canInterpolate}
                        className={`p-2 ml-2 rounded-md flex items-center gap-2 text-sm text-white font-semibold transition-colors ${canInterpolate ? 'bg-brand-green hover:bg-green-600' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                        title={mfaApplied || whisperApplied ? (isDirty ? "Save and interpolate edits into a new version (Ctrl+S)" : "No changes to save") : "Process MFA/Whisper timestamps before interpolating"}
                    >
                        <WandIcon className="w-5 h-5"/>
                        <span>Interpolate</span>
                    </button>
                    
                    <button onClick={handleExport} className="p-2 ml-2 rounded-md bg-gray-700 hover:bg-gray-600 transition-colors flex items-center gap-2 text-sm text-gray-300" title="Export transcript as text file">
                        <DownloadIcon className="w-5 h-5" />
                        <span>Export</span>
                    </button>
                    
                    <div className="flex items-center gap-1 ml-auto">
                        <button onClick={undo} disabled={!canUndo} className="p-2 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed" title="Undo (go to previous version)"><UndoIcon className="w-5 h-5 text-gray-400"/></button>
                        <button onClick={redo} disabled={!canRedo} className="p-2 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed" title="Redo (go to next version)"><RedoIcon className="w-5 h-5 text-gray-400"/></button>
                        <button onClick={handleReset} className="p-2 rounded-full hover:bg-gray-700 transition-colors" title="Reset Workspace">
                            <ResetIcon className="w-5 h-5 text-gray-400"/>
                        </button>
                    </div>
                </div>
            </div>
            <div className="bg-gray-800 rounded-lg shadow-lg flex items-center justify-end px-4 py-2 gap-4 text-sm">
                {mfaData ? (
                        <div className="flex items-center gap-2">
                        <span className="text-gray-400">MFA file loaded.</span>
                        <button
                            onClick={handleApplyMfaTimestamps}
                            disabled={currentTranscript.length === 0}
                            className="px-3 py-1 rounded-md bg-brand-green text-white font-semibold hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                        >
                            Process MFA
                        </button>
                        </div>
                ) : whisperData ? null : (
                        <FileUpload onFileUpload={handleMfaUpload} accept=".json" id="mfa-upload" disabled={mfaApplied || whisperApplied}>
                        <span className="text-gray-400 hover:text-white cursor-pointer">Upload MFA JSON</span>
                    </FileUpload>
                )}
                
                {whisperData ? (
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400">Whisper file loaded.</span>
                        <button
                            onClick={handleApplyWhisperTimestamps}
                            disabled={currentTranscript.length === 0}
                            className="px-3 py-1 rounded-md bg-brand-green text-white font-semibold hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                        >
                            Process Whisper
                        </button>
                    </div>
                ) : mfaData ? null : (
                    <FileUpload onFileUpload={handleWhisperUpload} accept=".json" id="whisper-upload" disabled={mfaApplied || whisperApplied}>
                        <span className="text-gray-400 hover:text-white cursor-pointer">Upload Whisper JSON</span>
                    </FileUpload>
                )}

                <FileUpload onFileUpload={handlePyannoteUpload} accept=".json" id="pyannote-upload" disabled={diarizationSegments.length > 0}>
                    <span className="text-gray-400 hover:text-white cursor-pointer">Upload Pyannote JSON</span>
                </FileUpload>
                
                 { !formattedTranscriptApplied && (
                    <FileUpload onFileUpload={handleFormattedTranscriptUpload} accept=".txt,text/plain" id="formatted-transcript-upload">
                        <span className="text-gray-400 hover:text-white cursor-pointer">Upload Formatted TXT</span>
                    </FileUpload>
                 )}
            </div>
            <div className="flex-1 overflow-hidden flex justify-center relative">
                 <div className="w-3/5 h-full">
                    {isFindBarOpen && (
                        <FindReplaceBar 
                            searchQuery={searchQuery}
                            onSearchQueryChange={setSearchQuery}
                            replaceQuery={replaceQuery}
                            onReplaceQueryChange={setReplaceQuery}
                            onClose={() => {
                                setIsFindBarOpen(false);
                                setSearchQuery('');
                                setReplaceQuery('');
                            }}
                            onNext={handleNextMatch}
                            onPrev={handlePrevMatch}
                            onReplace={handleReplace}
                            onReplaceAll={handleReplaceAll}
                            matchesCount={searchMatches.length}
                            currentMatchNumber={currentMatchIndex + 1}
                        />
                    )}
                    <TranscriptView 
                        ref={transcriptViewRef}
                        words={currentTranscript} 
                        onSeekToTime={handleSeekToTime} 
                        onSaveTranscript={setTranscript}
                        onTranscriptPaste={handleTranscriptPaste}
                        textZoom={textZoom}
                        searchQuery={searchQuery}
                        activeMatchIndex={activeMatchGlobalIndex}
                        onFindWord={handleFindRequest}
                        onEditStart={handleEditStart}
                        fontFamily={selectedFont}
                    />
                </div>
            </div>
        </div>
    );
};