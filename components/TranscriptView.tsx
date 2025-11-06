import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { MatchedWord } from '../types';
import { interpolateTimestamps, parsePastedTranscript } from '../services/processingService';

interface TranscriptViewProps {
    words: MatchedWord[];
    onSeekToTime: (time: number | null) => void;
    onSaveTranscript: (words: MatchedWord[]) => void;
    onTranscriptPaste: (text: string) => void;
    textZoom: number;
    searchQuery: string;
    activeMatchIndex: number;
    onFindWord: (query: string) => void;
    onEditStart: () => void;
    fontFamily?: string;
}

// GPT-4o style state interface (copying the exact approach)
interface TranscriptState {
    transcriptText: string;
}

interface WordMapping {
    wordIndex: number;
    startPos: number;
    endPos: number;
    word: MatchedWord;
}

export interface TranscriptViewHandle {
    insertTimestampAtCursor: (time: number) => void;
    insertSegmentTimestamp: (time: number, speakerLabel: string) => void;
    scrollToWord: (wordIndex: number) => void;
    seekToTime: (time: number) => void;
}

// Format timestamp like GPT-4o interface: simple, no blue styling
const formatSimpleTimestamp = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) {
        return "00:00:00.0";
    }
    const date = new Date(seconds * 1000);
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const secs = String(date.getUTCSeconds()).padStart(2, '0');
    const ms = String(date.getUTCMilliseconds()).padStart(3, '0').slice(0, 1);
    return `${hours}:${minutes}:${secs}.${ms}`;
};

export const TranscriptView = forwardRef<TranscriptViewHandle, TranscriptViewProps>(({ 
    words, onSeekToTime, onSaveTranscript, onTranscriptPaste, textZoom,
    searchQuery, activeMatchIndex, onFindWord, onEditStart, fontFamily = "font-mono"
}, ref) => {
    // GPT-4o style state (copying exact approach)
    const [state, setState] = useState<TranscriptState>({
        transcriptText: ''
    });
    
    const [wordMappings, setWordMappings] = useState<WordMapping[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, word: MatchedWord } | null>(null);
    
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Generate transcript text from words array (GPT-4o style: simple, clean)
    const generateTranscriptText = useCallback((wordsArray: MatchedWord[]): string => {
        if (wordsArray.length === 0) return '';
        
        let result = '';
        let currentParagraph: string[] = [];
        
        wordsArray.forEach((word, index) => {
            if (word.isParagraphStart && index > 0) {
                // End current paragraph and start new one
                if (currentParagraph.length > 0) {
                    result += currentParagraph.join(' ') + '\n\n';
                    currentParagraph = [];
                }
            }
            
            // Add timestamp and speaker for paragraph start (simple style)
            if (word.isParagraphStart) {
                const timestamp = word.start !== null ? formatSimpleTimestamp(word.start) : '';
                const speaker = word.speakerLabel || '';
                
                if (timestamp) {
                    currentParagraph.push(timestamp);
                }
                if (speaker) {
                    currentParagraph.push(`${speaker}:`);
                }
            }
            
            if (word.punctuated_word) {
                currentParagraph.push(word.punctuated_word);
            }
        });
        
        // Add final paragraph
        if (currentParagraph.length > 0) {
            result += currentParagraph.join(' ');
        }
        
        return result;
    }, []);

    // Generate word mappings for position-based lookup
    const generateWordMappings = useCallback((text: string, wordsArray: MatchedWord[]): WordMapping[] => {
        const mappings: WordMapping[] = [];
        let charPosition = 0;
        let wordIndex = 0;
        
        const textParts = text.split(/(\s+)/); // Split but keep whitespace
        
        for (const part of textParts) {
            if (part.trim() && wordIndex < wordsArray.length) {
                // Skip timestamps and speaker labels in mapping
                const isTimestamp = /^\d{2}:\d{2}:\d{2}\.\d$/.test(part);
                const isSpeaker = part.endsWith(':') && !isTimestamp;
                
                if (!isTimestamp && !isSpeaker) {
                    mappings.push({
                        wordIndex,
                        startPos: charPosition,
                        endPos: charPosition + part.length,
                        word: wordsArray[wordIndex]
                    });
                    wordIndex++;
                }
            }
            charPosition += part.length;
        }
        
        return mappings;
    }, []);

    // Update transcript text when words change
    useEffect(() => {
        const newText = generateTranscriptText(words);
        setState(prev => ({ ...prev, transcriptText: newText }));
        setWordMappings(generateWordMappings(newText, words));
    }, [words, generateTranscriptText, generateWordMappings]);

    // Handle text changes (GPT-4o style)
    const handleTextChange = useCallback((newText: string) => {
        setState(prev => ({ ...prev, transcriptText: newText }));
        
        // Parse text back to words and apply interpolation
        const newWords = parsePastedTranscript(newText);
        const interpolatedWords = interpolateTimestamps(newWords);
        
        onSaveTranscript(interpolatedWords);
    }, [onSaveTranscript]);

    // Find word at cursor position
    const findWordAtPosition = useCallback((cursorPos: number): MatchedWord | null => {
        const mapping = wordMappings.find(m => 
            cursorPos >= m.startPos && cursorPos <= m.endPos
        );
        return mapping?.word || null;
    }, [wordMappings]);

    // Handle right-click context menu
    const handleContextMenu = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
        e.preventDefault();
        
        const textarea = e.currentTarget;
        const cursorPos = textarea.selectionStart;
        const word = findWordAtPosition(cursorPos);
        
        if (word && word.start !== null) {
            setContextMenu({ x: e.clientX, y: e.clientY, word });
        }
    }, [findWordAtPosition, wordMappings]);

    // Handle click outside context menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setContextMenu(null);
            }
        };
        
        if (contextMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [contextMenu]);

    // Scroll to word (for timeline synchronization)
    const scrollToWord = useCallback((wordIndex: number) => {
        if (wordIndex >= 0 && wordIndex < wordMappings.length) {
            const mapping = wordMappings[wordIndex];
            if (textareaRef.current && mapping) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(mapping.startPos, mapping.endPos);
                
                // Scroll the word into view
                const textarea = textareaRef.current;
                const textBeforeCursor = state.transcriptText.substring(0, mapping.startPos);
                const lineHeight = parseInt(getComputedStyle(textarea).lineHeight);
                const approxLineNumber = textBeforeCursor.split('\n').length;
                const scrollTop = (approxLineNumber - 5) * lineHeight; // 5 lines buffer
                
                textarea.scrollTop = Math.max(0, scrollTop);
            }
        }
    }, [wordMappings, state.transcriptText]);

    // Seek to time from timeline click
    const seekToTime = useCallback((time: number) => {
        // Find the word closest to this time
        let closestWordIndex = -1;
        let closestTimeDiff = Infinity;
        
        words.forEach((word, index) => {
            if (word.start !== null) {
                const timeDiff = Math.abs(word.start - time);
                if (timeDiff < closestTimeDiff) {
                    closestTimeDiff = timeDiff;
                    closestWordIndex = index;
                }
            }
        });
        
        if (closestWordIndex >= 0) {
            scrollToWord(closestWordIndex);
        }
    }, [words, scrollToWord]);

    // Expose handle methods
    useImperativeHandle(ref, () => ({
        insertTimestampAtCursor: (time: number) => {
            if (textareaRef.current) {
                const textarea = textareaRef.current;
                const cursorPos = textarea.selectionStart;
                const timestamp = formatSimpleTimestamp(time);
                const newText = state.transcriptText.slice(0, cursorPos) + timestamp + ' ' + state.transcriptText.slice(cursorPos);
                handleTextChange(newText);
                
                // Move cursor after inserted timestamp
                setTimeout(() => {
                    textarea.setSelectionRange(cursorPos + timestamp.length + 1, cursorPos + timestamp.length + 1);
                    textarea.focus();
                }, 0);
            }
        },
        insertSegmentTimestamp: (time: number, speakerLabel: string) => {
            if (textareaRef.current) {
                const textarea = textareaRef.current;
                const cursorPos = textarea.selectionStart;
                const timestamp = formatSimpleTimestamp(time);
                const segment = `${timestamp} ${speakerLabel}: `;
                const newText = transcriptText.slice(0, cursorPos) + segment + transcriptText.slice(cursorPos);
                handleTextChange(newText);
                
                // Move cursor after inserted segment
                setTimeout(() => {
                    textarea.setSelectionRange(cursorPos + segment.length, cursorPos + segment.length);
                    textarea.focus();
                }, 0);
            }
        },
        scrollToWord,
        seekToTime
    }), [handleTextChange, transcriptText, scrollToWord, seekToTime]);

    // Handle paste
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        e.preventDefault();
        const pastedText = e.clipboardData.getData('text/plain');
        
        if (textareaRef.current) {
            const textarea = textareaRef.current;
            const { selectionStart, selectionEnd } = textarea;
            const newText = transcriptText.slice(0, selectionStart) + pastedText + transcriptText.slice(selectionEnd);
            handleTextChange(newText);
            
            // Move cursor to end of pasted text
            setTimeout(() => {
                const newCursorPos = selectionStart + pastedText.length;
                textarea.setSelectionRange(newCursorPos, newCursorPos);
                textarea.focus();
            }, 0);
        }
    }, [transcriptText, handleTextChange]);

    if (words.length === 0) {
        return (
            <div
                className="h-full bg-gray-800 border border-gray-600 rounded-md text-gray-400 flex items-center justify-center"
                onPaste={(e) => {
                    e.preventDefault();
                    onTranscriptPaste(e.clipboardData.getData('text/plain'));
                }}
            >
                <div className="text-center">
                    <p>Transcript will appear here after transcription...</p>
                    <p className="text-sm mt-2">Or paste transcript text to begin editing</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full relative">
            {/* GPT-4o Style Textarea - Clean and Simple */}
            <textarea
                ref={textareaRef}
                value={transcriptText}
                onChange={(e) => handleTextChange(e.target.value)}
                onContextMenu={handleContextMenu}
                onPaste={handlePaste}
                className="w-full h-full p-3 bg-gray-800 border border-gray-600 rounded-md text-white resize-none"
                style={{
                    fontSize: `${textZoom}rem`,
                    fontFamily: fontFamily,
                    lineHeight: 1.6
                }}
                placeholder="Transcript will appear here after transcription..."
                spellCheck={false}
            />

            {/* Context Menu */}
            {contextMenu && (
                <div 
                    ref={menuRef} 
                    style={{ 
                        position: 'fixed',
                        top: contextMenu.y, 
                        left: contextMenu.x,
                        zIndex: 1000
                    }} 
                    className="bg-gray-700 text-white rounded-md shadow-lg p-1 text-sm"
                >
                    <ul className="space-y-1">
                        <li 
                            onClick={() => {
                                if (contextMenu.word.start !== null) {
                                    onSeekToTime(contextMenu.word.start);
                                }
                                setContextMenu(null);
                                setHighlightedWordIndex(null);
                            }}
                            className="px-3 py-1 hover:bg-gray-600 rounded cursor-pointer"
                        >
                            Play word
                        </li>
                        <li 
                            onClick={() => {
                                onFindWord(contextMenu.word.punctuated_word);
                                setContextMenu(null);
                                setHighlightedWordIndex(null);
                            }}
                            className="px-3 py-1 hover:bg-gray-600 rounded cursor-pointer"
                        >
                            Find word
                        </li>
                    </ul>
                </div>
            )}
        </div>
    );
});