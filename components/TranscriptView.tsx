import React, { useState, useEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { MatchedWord, TranscriptParagraph } from '../types';
import { formatTimestamp, parsePastedTranscript, parseTimestamp, parseFormattedTranscript } from '../services/processingService';

interface TranscriptViewProps {
    words: MatchedWord[];
    onSeekToTime: (time: number | null) => void;
    onSaveTranscript: (words: MatchedWord[]) => void;
    onTranscriptPaste: (text: string) => void;
    textZoom: number;
    isLineNumbersVisible: boolean;
    searchQuery: string;
    activeMatchIndex: number;
    onFindWord: (query: string) => void;
    onEditStart: () => void;
}

export interface TranscriptViewHandle {
    insertTimestampAtCursor: (time: number) => void;
    insertSegmentTimestamp: (time: number, speakerLabel: string) => void;
    scrollToWord: (wordIndex: number) => void;
}

// A self-contained, stateful component for editing a single paragraph.
// It uses a textarea for a robust editing experience.
const EditableParagraph: React.FC<{
    paragraph: TranscriptParagraph;
    onSave: (newText: string, fromEnter: boolean) => void;
    textZoom: number;
    insertionRequest: { text: string } | null;
    onInsertionComplete: () => void;
    isNewParagraph?: boolean;
}> = ({ paragraph, onSave, textZoom, insertionRequest, onInsertionComplete, isNewParagraph = false }) => {
    
    // Memoize the initial text generation for the textarea.
    const initialText = useMemo(() => {
        let fullText = '';
        let currentLine: string[] = [];

        paragraph.words.forEach(word => {
            if (word.isParagraphStart && currentLine.length > 0) {
                fullText += currentLine.join(' ') + '\n';
                currentLine = [];
            }
            if (word.isParagraphStart) {
                const speaker = word.speakerLabel;
                const timestamp = word.start !== null ? formatTimestamp(word.start) : null;
                if (timestamp) fullText += `${timestamp} `;
                if (speaker) fullText += `${speaker}: `;
            }
            currentLine.push(word.punctuated_word);
        });

        if (currentLine.length > 0) {
            fullText += currentLine.join(' ');
        }
        return fullText;
    }, [paragraph]);

    const [text, setText] = useState(initialText);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Effect for auto-sizing the textarea to fit its content.
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto'; // Reset height
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [text, textZoom]);
    
    // Effect to handle text insertion requests from the parent (e.g., "Add Timestamp" button).
    useEffect(() => {
        if (insertionRequest && textareaRef.current) {
            const textarea = textareaRef.current;
            const { selectionStart, selectionEnd } = textarea;
            const newText = text.slice(0, selectionStart) + insertionRequest.text + text.slice(selectionEnd);
            setText(newText);

            // After insertion, set the cursor position and notify the parent.
            const newCursorPos = selectionStart + insertionRequest.text.length;
            requestAnimationFrame(() => {
                if(textareaRef.current) {
                    textareaRef.current.selectionStart = newCursorPos;
                    textareaRef.current.selectionEnd = newCursorPos;
                    textareaRef.current.focus();
                }
            });
            onInsertionComplete();
        }
    }, [insertionRequest, onInsertionComplete, text]);

    // Auto-focus the textarea when it mounts.
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
            // For new paragraphs (created from Enter key), place cursor at start
            // For existing paragraphs, place cursor at end
            const cursorPosition = isNewParagraph ? 0 : text.length;
            textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
            
            // Prevent container from scrolling by maintaining the current scroll position
            const container = textareaRef.current.closest('.transcript-editor-view');
            if (container) {
                const scrollTop = container.scrollTop;
                // Use requestAnimationFrame to ensure DOM updates are complete
                requestAnimationFrame(() => {
                    container.scrollTop = scrollTop;
                });
            }
        }
    }, [isNewParagraph, text.length]);

    const handleBlur = () => {
        // Small delay to allow any pending timestamp insertions to complete
        setTimeout(() => {
            onSave(text, false);
        }, 100);
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Pressing Enter splits the paragraph.
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const { selectionStart, selectionEnd } = e.currentTarget;
            const newTextWithSplit = text.slice(0, selectionStart) + '\n' + text.slice(selectionEnd);
            onSave(newTextWithSplit, true);
        }
    };

    return (
        <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent border-none outline-none focus:ring-0 resize-none p-0 m-0 block"
            style={{
                lineHeight: `${1.75 * textZoom}rem`,
                fontSize: 'inherit',
                color: 'inherit',
                fontFamily: 'inherit'
            }}
        />
    );
};


export const TranscriptView = forwardRef<TranscriptViewHandle, TranscriptViewProps>(({ 
    words, onSeekToTime, onSaveTranscript, onTranscriptPaste, textZoom,
    isLineNumbersVisible, searchQuery, activeMatchIndex, onFindWord, onEditStart
}, ref) => {
    const [editingParaIndex, setEditingParaIndex] = useState<number | null>(null);
    const [insertionRequest, setInsertionRequest] = useState<{ text: string } | null>(null);
    const paraRefs = useRef<(HTMLDivElement | null)[]>([]);
    const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const menuRef = useRef<HTMLDivElement>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, word: MatchedWord } | null>(null);
    const nextEditingParaIndex = useRef<number | null>(null);
    const isNewParagraph = useRef<boolean>(false);

    useEffect(() => {
        wordRefs.current = wordRefs.current.slice(0, words.length);
    }, [words]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setContextMenu(null);
            }
        };
        if (contextMenu) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [contextMenu]);

    const paragraphs: TranscriptParagraph[] = useMemo(() => {
        if (words.length === 0) return [];
        const result: TranscriptParagraph[] = [];
        let currentParagraph: MatchedWord[] = [];
        let startingIndex = 0;

        words.forEach((word, index) => {
            if (word.isParagraphStart && currentParagraph.length > 0) {
                result.push({ words: currentParagraph, startingWordIndex: startingIndex, endingWordIndex: index - 1 });
                currentParagraph = [];
                startingIndex = index;
            }
            currentParagraph.push(word);
        });

        if (currentParagraph.length > 0) {
            result.push({ words: currentParagraph, startingWordIndex: startingIndex, endingWordIndex: words.length - 1 });
        }
        
        paraRefs.current = paraRefs.current.slice(0, result.length);
        return result;
    }, [words]);
    
    // This effect runs after the transcript has been saved and the paragraphs have been re-calculated.
    // It checks if a follow-up action (like editing the next paragraph after a split) was scheduled.
    useEffect(() => {
        if (nextEditingParaIndex.current !== null && nextEditingParaIndex.current < paragraphs.length) {
            setEditingParaIndex(nextEditingParaIndex.current);
            isNewParagraph.current = true; // Mark as new paragraph for cursor positioning
            nextEditingParaIndex.current = null; // Clear the scheduled action
        }
    }, [paragraphs]);
    
    useEffect(() => {
        if (activeMatchIndex !== -1) {
            wordRefs.current[activeMatchIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [activeMatchIndex]);
    
    const saveParagraph = useCallback((pIndex: number, newText: string) => {
        const paragraph = paragraphs[pIndex];
        if (!paragraph) return;

        const lines = newText.split('\n');
        const allNewWords: MatchedWord[] = [];
        const originalFirstWord = paragraph.words[0];
        
        lines.forEach((line, lineIndex) => {
            const trimmedLine = line.trim();
            if (trimmedLine === '' && lines.length > 1) {
                 allNewWords.push({ 
                    number: 0, punctuated_word: '', cleaned_word: '', start: null, end: null,
                    isParagraphStart: true, speakerLabel: undefined
                 });
                return;
            }

            // Enhanced regex to match various speaker tag formats like the VirtualTranscriptEditor
            // Supports: "S1:", "S?:", "Speaker 1:", "Name:", etc.
            const match = trimmedLine.match(/^(?:((?:\d{2}:){1,2}\d{2}[.,]\d+)\s+)?(?:([^:]+):\s+)?(.*)$/);
            const newTimestampStr = match?.[1] || null;
            const speakerTag = match?.[2] || null;
            
            // Check if the speaker tag looks like an actual speaker (not just random text with a colon)
            const isSpeakerTag = speakerTag ? /^(S\d+|S\?|Speaker\s*\d+|[A-Z][a-zA-Z\s]*?)$/.test(speakerTag.trim()) : false;
            const explicitSpeaker = isSpeakerTag ? speakerTag.trim() : null;
            const newWordsText = match?.[3] ?? trimmedLine;
            const newTimestamp = newTimestampStr ? parseTimestamp(newTimestampStr) : null;

            const newWordsForLine: MatchedWord[] = newWordsText.split(/\s+/).filter(Boolean).map(word => ({
                number: 0, punctuated_word: word,
                cleaned_word: word.toLowerCase().replace(/[.,!?]/g, ''),
                start: null, end: null,
            }));
            
            if (newWordsForLine.length === 0 && lineIndex > 0) {
                 allNewWords.push({ 
                    number: 0, punctuated_word: '', cleaned_word: '', start: null, end: null,
                    isParagraphStart: true, speakerLabel: explicitSpeaker ?? undefined
                 });
                 return;
            }

            if (newWordsForLine.length > 0) {
                if (lineIndex === 0) {
                    newWordsForLine[0].isParagraphStart = originalFirstWord?.isParagraphStart;
                    newWordsForLine[0].speakerLabel = explicitSpeaker ?? originalFirstWord?.speakerLabel;
                    newWordsForLine[0].start = newTimestamp ?? originalFirstWord?.start;
                } else {
                    newWordsForLine[0].isParagraphStart = true;
                    newWordsForLine[0].speakerLabel = explicitSpeaker ?? undefined;
                    newWordsForLine[0].start = newTimestamp;
                }
                allNewWords.push(...newWordsForLine);
            }
        });
        
        const newFullTranscript = [
            ...words.slice(0, paragraph.startingWordIndex),
            ...allNewWords.filter(w => w.punctuated_word !== '' || w.isParagraphStart),
            ...words.slice(paragraph.endingWordIndex + 1)
        ];
        
        onSaveTranscript(newFullTranscript.map((w, i) => ({...w, number: i + 1})));
    }, [paragraphs, words, onSaveTranscript]);
    
    useImperativeHandle(ref, () => ({
        insertTimestampAtCursor: (time: number) => {
            if (editingParaIndex === null) {
                alert("Please double-click a paragraph to enter edit mode first.");
                return;
            }
            setInsertionRequest({ text: `${formatTimestamp(time)} ` });
        },
        insertSegmentTimestamp: (time: number, speakerLabel: string) => {
            if (editingParaIndex === null) {
                // If no paragraph is being edited, try to find the last paragraph and auto-enter edit mode
                if (paragraphs.length > 0) {
                    const lastParaIndex = paragraphs.length - 1;
                    setEditingParaIndex(lastParaIndex);
                    // Use a timeout to ensure the edit mode is established before inserting
                    setTimeout(() => {
                        setInsertionRequest({ text: `${formatTimestamp(time)} ${speakerLabel}: ` });
                    }, 50);
                } else {
                    alert("Please double-click a paragraph to enter edit mode first.");
                }
                return;
            }
            setInsertionRequest({ text: `${formatTimestamp(time)} ${speakerLabel}: ` });
        },
        scrollToWord: (wordIndex: number) => {
            if (wordIndex >= 0 && wordIndex < wordRefs.current.length) {
                wordRefs.current[wordIndex]?.scrollIntoView({ behavior: 'auto', block: 'center' });
            }
        }
    }));

    const handleGlobalPaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        onTranscriptPaste(e.clipboardData.getData('text/plain'));
    };

    const handleParagraphDoubleClick = (pIndex: number) => {
        if (editingParaIndex !== pIndex) {
            onEditStart();
            setEditingParaIndex(pIndex);
        }
    };

    const handleWordClick = (e: React.MouseEvent, pIndex: number, globalWordIndex: number) => {
        // Left click now enters edit mode instead of playing audio
        e.preventDefault();
        e.stopPropagation();
        if (editingParaIndex !== pIndex) {
            onEditStart();
            setEditingParaIndex(pIndex);
        }
    };
    
    const handleWordContextMenu = (e: React.MouseEvent, word: MatchedWord) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, word: word });
    };

    const handleMenuAction = (action: () => void) => {
        action();
        setContextMenu(null);
    };

    if (words.length === 0) {
        return (
            <div
                className="h-full bg-gray-900 p-6 rounded-lg shadow-inner text-gray-500 text-center flex flex-col items-center justify-center"
                onPaste={handleGlobalPaste}
            >
                <p>Transcript will appear here.</p>
                <p className="mt-2 text-sm">Paste transcript text or use the chat to transcribe.</p>
            </div>
        );
    }
    
    return (
        <div 
            className="transcript-editor-view h-full bg-gray-900 rounded-lg shadow-inner text-lg text-gray-300 focus:outline-none overflow-y-auto scrollbar-thin p-6" 
            tabIndex={-1} 
            style={{ fontSize: `${1 * textZoom}rem` }}
        >
            {paragraphs.map((paragraph, pIndex) => {
                const firstWord = paragraph.words[0];
                const isEmptyPara = paragraph.words.length === 1 && paragraph.words[0].punctuated_word === '';
                const showSpeaker = !!firstWord?.speakerLabel;
                const showTimestamp = showSpeaker && firstWord?.start !== null;
                const isEditing = editingParaIndex === pIndex;

                return (
                    <div
                        key={paragraph.startingWordIndex}
                        ref={el => { paraRefs.current[pIndex] = el; }}
                        className={`virtualized-paragraph flex items-start mb-2 relative rounded -mx-2 px-2 transition-colors ${isEditing ? 'bg-brand-blue/25' : 'hover:bg-gray-800/50'}`}
                        onDoubleClick={() => handleParagraphDoubleClick(pIndex)}
                    >
                        {isLineNumbersVisible && (
                             <div 
                                className="pr-4 pt-1 text-right font-mono text-gray-600 select-none text-base flex-shrink-0"
                                style={{ lineHeight: `${1.75 * textZoom}rem`, width: '4rem' }}
                             >
                                {firstWord?.number ?? ''}
                            </div>
                        )}
                        <div 
                            className="flex-1 pt-1 min-h-[1.75rem]"
                            style={{ lineHeight: `${1.75 * textZoom}rem` }}
                        >
                            {isEditing ? (
                                <EditableParagraph 
                                    paragraph={paragraph}
                                    onSave={(newText, fromEnter) => {
                                        if (fromEnter) {
                                            // When Enter is pressed, we schedule the next paragraph to be edited.
                                            // The useEffect watching `paragraphs` will handle the state update.
                                            nextEditingParaIndex.current = pIndex + 1;
                                        }
                                        saveParagraph(pIndex, newText);
                                        if (!fromEnter) {
                                            setEditingParaIndex(null);
                                        }
                                        // When fromEnter is true, we keep editing active for the new paragraph
                                        isNewParagraph.current = false; // Reset after save
                                    }}
                                    textZoom={textZoom}
                                    insertionRequest={insertionRequest}
                                    onInsertionComplete={() => setInsertionRequest(null)}
                                    isNewParagraph={isNewParagraph.current}
                                />
                            ) : (
                                <div className="outline-none">
                                    {showTimestamp && (
                                        <span className="font-mono text-sm text-brand-blue mr-3 select-none">
                                            {formatTimestamp(firstWord.start!)}
                                        </span>
                                    )}
                                    {showSpeaker && <strong className="mr-2 text-gray-400 select-none">{firstWord.speakerLabel}:</strong>}

                                    {!isEmptyPara && paragraph.words.map((word, wordIndexInPara) => {
                                        const globalWordIndex = paragraph.startingWordIndex + wordIndexInPara;
                                        const isMatch = searchQuery && word.punctuated_word.toLowerCase().includes(searchQuery.toLowerCase());
                                        const isActiveMatch = globalWordIndex === activeMatchIndex;
                                        
                                        return (
                                            <React.Fragment key={globalWordIndex}>
                                                <span
                                                    ref={el => { if (el) wordRefs.current[globalWordIndex] = el; }}
                                                    onContextMenu={(e) => handleWordContextMenu(e, word)}
                                                    onClick={(e) => handleWordClick(e, pIndex, globalWordIndex)}
                                                    className={`
                                                        cursor-pointer hover:bg-gray-700 rounded
                                                        ${isActiveMatch ? 'bg-orange-500 text-white' : ''}
                                                        ${!isActiveMatch && isMatch ? 'bg-yellow-500/50' : ''}
                                                    `}
                                                >{word.punctuated_word}</span>
                                                {' '}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
            {contextMenu && (
                <div ref={menuRef} style={{ top: contextMenu.y, left: contextMenu.x }} className="fixed bg-gray-700 text-white rounded-md shadow-lg p-1 z-50 text-sm">
                    <ul className="space-y-1">
                        <li onClick={() => handleMenuAction(() => onSeekToTime(contextMenu.word.start))} className="px-3 py-1 hover:bg-gray-600 rounded cursor-pointer">Play word</li>
                        <li onClick={() => handleMenuAction(() => window.open(`https://www.google.com/search?q=${encodeURIComponent(contextMenu.word.punctuated_word)}`, '_blank'))} className="px-3 py-1 hover:bg-gray-600 rounded cursor-pointer">Search word</li>
                        <li onClick={() => handleMenuAction(() => onFindWord(contextMenu.word.punctuated_word))} className="px-3 py-1 hover:bg-gray-600 rounded cursor-pointer">Find...</li>
                    </ul>
                </div>
            )}
        </div>
    );
});