import type { PyannoteDiarization, MatchedWord, DiarizationSegment, SpeakerMap, TranscriptVersion } from '../types';
import { SPEAKER_COLORS } from '../constants';

// ===== PARAGRAPH PROCESSOR LOGIC =====
// Based on paragraph_processor_v4.py for precision MFA timestamp preservation

/**
 * Extract speaker and text from a formatted paragraph line.
 * Expected formats:
 * - "0:00:07.8 S1: Hello world"
 * - "S1: Hello world"
 * - "SPEAKER_01: Hello world"
 */
export const extractSpeakerAndText = (paragraph: string): { speaker: string | null; text: string | null } => {
    const trimmed = paragraph.trim();
    if (!trimmed) return { speaker: null, text: null };

    // Pattern: Optional timestamp + Speaker + Colon + Text
    // e.g., "0:00:07.8 S1: Okay." or "S1: Okay."
    const pattern = /^(?:(?:\d+:)?\d{2}:\d{2}\.\d\s)?([^:]+):\s*(.+)/;
    const match = trimmed.match(pattern);

    if (!match) return { speaker: null, text: trimmed };

    const speakerRaw = match[1].trim();
    const text = match[2].trim();

    // Normalize speaker labels
    let speaker: string;
    if (speakerRaw.startsWith('SPEAKER_')) {
        // Convert SPEAKER_01 to S1, SPEAKER_02 to S2, etc.
        try {
            const num = parseInt(speakerRaw.split('_')[1]) + 1;
            speaker = `S${num}`;
        } catch {
            speaker = speakerRaw;
        }
    } else {
        speaker = speakerRaw;
    }

    return { speaker, text };
};

/**
 * Match paragraph words to MFA JSON words using lookahead window
 * Returns timing information for the paragraph based on matched words
 */
export const matchParagraphWords = (
    paragraphText: string,
    mfaWords: MatchedWord[],
    startIdx: number = 0,
    lookahead: number = 6
): {
    matchedWords: MatchedWord[];
    nextStartIdx: number;
} => {
    const paragraphTokens = paragraphText.split(/\s+/).filter(Boolean);
    const matchedWords: MatchedWord[] = [];
    let mfaIdx = startIdx;

    for (const token of paragraphTokens) {
        const normalizedToken = normalizeToken(token);
        let foundMatch = false;

        for (let i = 0; i < lookahead && mfaIdx + i < mfaWords.length; i++) {
            const mfaWord = mfaWords[mfaIdx + i];
            const normalizedMfaWord = normalizeToken(mfaWord.cleaned_word);

            if (tokensCloseMatch(normalizedToken, normalizedMfaWord)) {
                matchedWords.push({
                    ...mfaWord,
                    punctuated_word: token,
                    mfaSource: true,
                });
                mfaIdx = mfaIdx + i + 1;
                foundMatch = true;
                break;
            }
        }

        if (!foundMatch) {
            matchedWords.push({
                number: 0,
                punctuated_word: token,
                cleaned_word: normalizeToken(token),
                start: null,
                end: null,
                mfaSource: false,
            });
        }
    }

    return {
        matchedWords,
        nextStartIdx: mfaIdx,
    };
};

/**
 * Process formatted transcript with MFA JSON to create timestamped transcript
 * This is the core paragraph processor logic
 */
export const processFormattedTranscriptWithMfa = (
    formattedText: string,
    mfaWords: MatchedWord[]
): MatchedWord[] => {
    const lines = formattedText.split('\n').filter(line => line.trim());
    const processedWords: MatchedWord[] = [];
    let currentMfaIdx = 0;

    for (const line of lines) {
        const { speaker, text } = extractSpeakerAndText(line);

        if (text) {
            const { matchedWords, nextStartIdx } = matchParagraphWords(
                text,
                mfaWords,
                currentMfaIdx
            );
            currentMfaIdx = nextStartIdx;

            if (matchedWords.length > 0) {
                matchedWords[0].isParagraphStart = true;
                matchedWords[0].speakerLabel = speaker || undefined;
                processedWords.push(...matchedWords);
            }
        }
    }

    return processedWords.map((word, index) => ({ ...word, number: index + 1 }));
};

// Advanced word matching algorithm based on the uploaded Python code
// This provides 99% accuracy for Montreal alignment and potentially 100% for WhisperX

export const normalizeToken = (word: string): string => {
    // Lowercase
    let normalized = word.toLowerCase();
    
    // Normalize common punctuation that differs between transcript and aligner
    normalized = normalized.replace("'", "'");
    
    // Strip leading/trailing punctuation
    normalized = normalized.replace(/^[.,!?;:\"()\[\]{}]+|[.,!?;:\"()\[\]{}]+$/g, '');
    
    // Remove apostrophes for matching (handles sheriff's vs sheriffs vs sheriff)
    normalized = normalized.replace(/'/g, '');
    
    // Collapse hyphens
    normalized = normalized.replace(/-/g, '');
    
    return normalized;
};

export const tokensCloseMatch = (transcriptToken: string, alignToken: string): boolean => {
    // After normalization, check exact match
    if (transcriptToken === alignToken) {
        return true;
    }
    
    // Handle simple plural/suffix drift (e.g., sheriff vs sheriffs)
    if (transcriptToken.endsWith('s') && transcriptToken.slice(0, -1) === alignToken) {
        return true;
    }
    if (alignToken.endsWith('s') && alignToken.slice(0, -1) === transcriptToken) {
        return true;
    }
    
    return false;
};

export const advancedWordMatching = (
    transcriptWords: MatchedWord[], 
    alignWords: MatchedWord[], 
    lookahead: number = 6
): MatchedWord[] => {
    const matched: MatchedWord[] = [];
    let alignIndex = 0;
    const alignLength = alignWords.length;
    
    // Skip any non-word artifacts at the start
    while (alignIndex < alignLength && (!alignWords[alignIndex] || !alignWords[alignIndex].punctuated_word)) {
        alignIndex++;
    }
    
    for (const transcriptWord of transcriptWords) {
        const transcriptClean = transcriptWord.punctuated_word || '';
        const transcriptNorm = normalizeToken(transcriptClean);
        
        // Search in a bounded window ahead
        let foundIndex = null;
        const windowEnd = Math.min(alignIndex + lookahead, alignLength);
        
        for (let j = alignIndex; j < windowEnd; j++) {
            const alignWord = alignWords[j];
            if (!alignWord || !alignWord.punctuated_word) continue;
            
            const alignClean = alignWord.punctuated_word;
            const alignNorm = normalizeToken(alignClean);
            
            if (tokensCloseMatch(transcriptNorm, alignNorm)) {
                foundIndex = j;
                break;
            }
        }
        
        if (foundIndex !== null) {
            const alignWord = alignWords[foundIndex];
            matched.push({
                number: transcriptWord.number,
                punctuated_word: transcriptWord.punctuated_word,
                cleaned_word: transcriptClean,
                start: alignWord.start,
                end: alignWord.end,
                speakerLabel: transcriptWord.speakerLabel,
                isParagraphStart: transcriptWord.isParagraphStart,
            });
            alignIndex = foundIndex + 1; // Advance anchor just after the match
        } else {
            // Not found in window: emit None timestamps, keep moving forward
            matched.push({
                number: transcriptWord.number,
                punctuated_word: transcriptWord.punctuated_word,
                cleaned_word: transcriptClean,
                start: null,
                end: null,
                speakerLabel: transcriptWord.speakerLabel,
                isParagraphStart: transcriptWord.isParagraphStart,
            });
            // Optionally, nudge alignIndex forward to avoid permanent stall
            // alignIndex = Math.min(alignIndex + 1, alignLength);
        }
    }
    
    return matched;
};

export const parsePyannote = (data: PyannoteDiarization): { segments: DiarizationSegment[], speakerMap: SpeakerMap } => {
    const segments = data.diarization;
    const speakerMap: SpeakerMap = {};
    let speakerCount = 0;

    const sortedSpeakers = [...new Set(segments.map(s => s.speaker))].sort();

    sortedSpeakers.forEach(speakerId => {
        if (!speakerMap[speakerId]) {
            speakerMap[speakerId] = {
                name: `S${speakerCount + 1}`,
                color: SPEAKER_COLORS[speakerCount % SPEAKER_COLORS.length],
            };
            speakerCount++;
        }
    });

    return { segments, speakerMap };
};

export const interpolateTimestamps = (words: MatchedWord[]): MatchedWord[] => {
    const newWords = [...words.map(w => ({...w}))]; // Deep copy for mutation
    for (let i = 0; i < newWords.length; i++) {
        if (newWords[i].start === null) {
            let prevTimedWordIndex = -1;
            for (let j = i - 1; j >= 0; j--) {
                if (newWords[j].start !== null && newWords[j].end !== null) {
                    prevTimedWordIndex = j;
                    break;
                }
            }

            let nextTimedWordIndex = -1;
            for (let j = i + 1; j < newWords.length; j++) {
                if (newWords[j].start !== null) {
                    nextTimedWordIndex = j;
                    break;
                }
            }
            
            if (prevTimedWordIndex !== -1 && nextTimedWordIndex !== -1) {
                const prevWord = newWords[prevTimedWordIndex];
                const nextWord = newWords[nextTimedWordIndex];
                const timeDiff = (nextWord.start! - (prevWord.end ?? prevWord.start)!);
                const wordsInBetween = nextTimedWordIndex - prevTimedWordIndex - 1;

                if (timeDiff > 0 && wordsInBetween >= 0) {
                     const timePerWord = timeDiff / (wordsInBetween + 1);
                    for (let k = prevTimedWordIndex + 1; k < nextTimedWordIndex; k++) {
                        const lastEnd = newWords[k - 1].end!;
                        newWords[k].start = lastEnd;
                        newWords[k].end = lastEnd + timePerWord;
                    }
                } else {
                     for (let k = prevTimedWordIndex + 1; k < nextTimedWordIndex; k++) {
                        newWords[k].start = newWords[k-1].end;
                        newWords[k].end = newWords[k-1].end;
                    }
                }
                i = nextTimedWordIndex - 1;
            } else if (prevTimedWordIndex !== -1) {
                // Only a previous word, estimate based on an offset
                newWords[i].start = newWords[prevTimedWordIndex].end;
                newWords[i].end = (newWords[i].start ?? 0) + 0.5; // Default 0.5s duration
            } else if (nextTimedWordIndex !== -1) {
                // Only a next word, estimate backwards
                let nextStart = newWords[nextTimedWordIndex].start!;
                for (let k = nextTimedWordIndex - 1; k >= i; k--) {
                    newWords[k].end = nextStart;
                    newWords[k].start = nextStart - 0.5;
                    nextStart = newWords[k].start!;
                }
            } else {
                // No timed words at all
                newWords[i].start = (newWords[i-1]?.end || 0);
                newWords[i].end = newWords[i].start! + 0.5;
            }
        }
    }
    return newWords;
};

/**
 * Aligns a transcript (source) with timestamped data (target) using dynamic programming
 * to find the optimal alignment, then applies the timestamps from target to source.
 * This is robust to minor differences, insertions, and deletions.
 * @param sourceWords - The transcript to apply timestamps to (e.g., from pasted text).
 * @param targetWords - The transcript with accurate timestamps (e.g., from Whisper).
 * @returns A new array of MatchedWord with timestamps applied.
 */
export const alignAndApplyTimestamps = (sourceWords: MatchedWord[], targetWords: MatchedWord[]): MatchedWord[] => {
    const n = sourceWords.length;
    const m = targetWords.length;

    // Scores for alignment
    const MATCH_SCORE = 5;
    const MISMATCH_PENALTY = -3;
    const GAP_PENALTY = -4; // For insertions/deletions

    // DP table and traceback table
    const dp = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));
    const traceback = Array(n + 1).fill(null).map(() => Array(m + 1).fill(''));

    // Initialize DP table
    for (let i = 1; i <= n; i++) {
        dp[i][0] = dp[i-1][0] + GAP_PENALTY;
        traceback[i][0] = 'up';
    }
    for (let j = 1; j <= m; j++) {
        dp[0][j] = dp[0][j-1] + GAP_PENALTY;
        traceback[0][j] = 'left';
    }

    // Fill DP table
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const score = sourceWords[i - 1].cleaned_word === targetWords[j - 1].cleaned_word ? MATCH_SCORE : MISMATCH_PENALTY;
            
            const matchScore = dp[i - 1][j - 1] + score;
            const deleteScore = dp[i - 1][j] + GAP_PENALTY; // Deletion from target (gap in source)
            const insertScore = dp[i][j - 1] + GAP_PENALTY; // Insertion into target (gap in target)

            let maxScore = matchScore;
            let direction = 'diag';

            if (deleteScore > maxScore) {
                maxScore = deleteScore;
                direction = 'up';
            }
            if (insertScore > maxScore) {
                maxScore = insertScore;
                direction = 'left';
            }
            
            dp[i][j] = maxScore;
            traceback[i][j] = direction;
        }
    }

    // Traceback to find alignment
    const alignedSource = [...sourceWords.map(w => ({...w}))]; // Make a mutable copy
    let i = n;
    let j = m;

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && traceback[i][j] === 'diag') {
            // This is a match or mismatch. We transfer the timestamp regardless.
            alignedSource[i - 1].start = targetWords[j - 1].start;
            alignedSource[i - 1].end = targetWords[j - 1].end;
            i--;
            j--;
        } else if (i > 0 && traceback[i][j] === 'up') {
            // Deletion in source text relative to target. Source word gets no timestamp.
            alignedSource[i - 1].start = null;
            alignedSource[i - 1].end = null;
            i--;
        } else if (j > 0) {
            // Insertion in source text relative to target.
            j--;
        } else if (i > 0) {
            // Ran out of target words, remaining source words get no timestamp.
            alignedSource[i - 1].start = null;
            alignedSource[i - 1].end = null;
            i--;
        } else {
             // Should not happen if loops are correct
            break;
        }
    }

    return alignedSource;
};


export const parseMfa = (data: any): MatchedWord[] => {
    let wordList: any[];

    // Case 1: The data is the array itself (user's format)
    if (Array.isArray(data)) {
        wordList = data;
    } 
    // Case 2: The data is an object with a 'words' property which is an array
    else if (data && typeof data === 'object' && Array.isArray(data.words)) {
        wordList = data.words;
    }
    // Case 3: Handle TextGrid format (e.g., from Prosodylab-Aligner)
    else if (data && data.tiers && data.tiers.words && Array.isArray(data.tiers.words.entries)) {
        // TextGrid entries are tuples: [start, end, label]
        wordList = data.tiers.words.entries.map((entry: [number, number, string]) => ({
            start: entry[0],
            end: entry[1],
            word: entry[2], // Use 'word' as the property name to be consistent
        }));
    }
    // If none of the above, we can't parse it
    else {
        throw new Error("Unsupported MFA JSON structure. Expected an array of words, an object with a 'words' property, or a TextGrid JSON format.");
    }
    
    // Now that we have the wordList array, proceed with mapping.
    // Handle the user's format with number, punctuated_word, cleaned_word, start, end
    const mappedWords = wordList.map((item, index) => {
        // User's format already has punctuated_word and cleaned_word
        const text = item.punctuated_word || item.word || item.label || '';
        const cleanedWord = item.cleaned_word || text.toLowerCase().replace(/[.,!?]/g, '');
        
        return {
            number: item.number || (index + 1),
            punctuated_word: text,
            cleaned_word: cleanedWord,
            start: item.start ?? item.begin ?? null,
            end: item.end ?? null,
            mfaSource: true, // Mark as MFA source for precision tracking
        };
    });

    // No interpolation needed - MFA data already has precise timestamps
    return mappedWords;
};

export const parseWhisperJson = (data: any): MatchedWord[] => {
    if (
        !data?.results?.channels?.[0]?.alternatives?.[0]?.words ||
        !Array.isArray(data.results.channels[0].alternatives[0].words)
    ) {
        throw new Error("Unsupported Whisper JSON structure. Expected results.channels[0].alternatives[0].words to be an array.");
    }

    const wordList = data.results.channels[0].alternatives[0].words;

    const mappedWords = wordList.map((item: any, index: number) => {
        const text = item.punctuated_word || item.word || '';
        return {
            number: index + 1, // This will be re-numbered later when merged
            punctuated_word: text,
            cleaned_word: text.toLowerCase().replace(/[.,!?]/g, ''),
            start: item.start ?? null,
            end: item.end ?? null,
        };
    });

    return interpolateTimestamps(mappedWords);
};

export const parsePastedTranscript = (text: string): MatchedWord[] => {
    if (!text.trim()) {
        return [];
    }

    // Parse text preserving paragraph structure by detecting line breaks and speaker patterns
    const lines = text.split('\n');
    const allWords: MatchedWord[] = [];
    let wordNumber = 1;
    
    // Speaker/timestamp pattern regex (matches various formats)
    const speakerTimestampRegex = /^(\d{2}:\d{2}:\d{2}\.\d+)?\s*([A-Za-z][A-Za-z0-9\s]*:|\S+:)\s*/;
    
    lines.forEach((line, lineIndex) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return; // Skip empty lines
        
        let lineText = trimmedLine;
        let speakerLabel: string | null = null;
        
        // Check if line starts with speaker tag or timestamp
        const speakerMatch = lineText.match(speakerTimestampRegex);
        if (speakerMatch) {
            // Extract speaker from pattern like "00:12:34.5 S1:" or "Speaker 1:"
            const speakerPart = speakerMatch[2];
            if (speakerPart) {
                speakerLabel = speakerPart.replace(':', '').trim();
                lineText = lineText.replace(speakerTimestampRegex, '').trim();
            }
        }
        
        // Split remaining text into words
        const words = lineText.split(/\s+/).filter(w => w.trim());
        
        words.forEach((word, wordIndex) => {
            allWords.push({
                punctuated_word: word,
                cleaned_word: word.toLowerCase().replace(/[.,!?]/g, ''),
                start: null, // Will be filled by interpolation or MFA matching
                end: null,
                number: wordNumber++,
                speakerLabel: wordIndex === 0 ? speakerLabel : undefined,
                isParagraphStart: wordIndex === 0, // First word of each line starts a new paragraph
            });
        });
    });
    
    return allWords;
};

// Enhanced parsing for formatted transcripts with speaker tags
export interface ParsedTranscriptLine {
    timestamp: number | null;
    speaker: string | null;
    text: string;
    originalLine: string;
}

export interface SpeakerTagInfo {
    speaker: string;
    timestamp: number | null;
    position: number; // Position in the original word array where this speaker starts
}

/**
 * Parses a formatted transcript with speaker tags and timestamps
 * Handles formats like:
 * - "00:00:26.3 S1: Hello?"
 * - "S2: May I speak to Michael?"
 * - "Speaker 1: Some text"
 * - "Name: Some text"
 */
export const parseFormattedTranscript = (text: string): { words: MatchedWord[], speakerTags: SpeakerTagInfo[] } => {
    const lines = text.split('\n').filter(line => line.trim());
    const allWords: MatchedWord[] = [];
    const speakerTags: SpeakerTagInfo[] = [];
    let wordNumber = 1;
    
    lines.forEach((line, lineIndex) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;
        
        // Enhanced regex to match various speaker tag formats
        // Captures: [full match, optional timestamp, speaker tag, remaining text]
        const speakerMatch = trimmedLine.match(/^(?:((?:\d{2}:){1,2}\d{2}[.,]\d+)\s+)?([^:]+):\s*(.*)$/);
        
        let timestamp: number | null = null;
        let speaker: string | null = null;
        let textContent: string = trimmedLine;
        
        if (speakerMatch) {
            const [, timestampStr, speakerTag, remainingText] = speakerMatch;
            
            // Check if the speaker tag looks like an actual speaker (not just random text with a colon)
            // Speaker tags typically match patterns like S1, S2, Speaker 1, or proper names
            const isSpeakerTag = /^(S\d+|S\?|Speaker\s*\d+|[A-Z][a-zA-Z\s]*?)$/.test(speakerTag.trim());
            
            if (isSpeakerTag) {
                timestamp = timestampStr ? parseTimestamp(timestampStr) : null;
                speaker = speakerTag.trim();
                textContent = remainingText.trim();
                
                // Record speaker tag info
                if (speaker) {
                    speakerTags.push({
                        speaker,
                        timestamp,
                        position: allWords.length
                    });
                }
            }
        }
        
        // Split text into words
        const wordsInLine = textContent.split(/\s+/).filter(w => w);
        
        wordsInLine.forEach((word, wordIndex) => {
            allWords.push({
                punctuated_word: word,
                cleaned_word: word.toLowerCase().replace(/[.,!?]/g, ''),
                start: null, // Will be filled by MFA/Whisper
                end: null,   // Will be filled by MFA/Whisper
                number: wordNumber++,
                isParagraphStart: wordIndex === 0 && (lineIndex > 0 || speaker !== null),
                speakerLabel: speaker || undefined
            });
        });
    });
    
    return { words: allWords, speakerTags };
};

/**
 * Strips speaker tags from a formatted transcript to prepare for MFA/Whisper matching
 * Returns clean text without speaker tags or timestamps
 */
export const stripSpeakerTags = (text: string): string => {
    const lines = text.split('\n').filter(line => line.trim());
    const cleanedLines: string[] = [];
    
    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;
        
        // Match and remove speaker tags
        const speakerMatch = trimmedLine.match(/^(?:(?:\d{2}:){1,2}\d{2}[.,]\d+\s+)?([^:]+):\s*(.*)$/);
        
        if (speakerMatch) {
            const [, possibleSpeaker, remainingText] = speakerMatch;
            // Check if it's a valid speaker tag
            const isSpeakerTag = /^(S\d+|S\?|Speaker\s*\d+|[A-Z][a-zA-Z\s]*?)$/.test(possibleSpeaker.trim());
            
            if (isSpeakerTag) {
                cleanedLines.push(remainingText.trim());
            } else {
                cleanedLines.push(trimmedLine);
            }
        } else {
            cleanedLines.push(trimmedLine);
        }
    });
    
    return cleanedLines.join(' ');
};

/**
 * Reconstructs speaker tags and timestamps after MFA/Whisper matching
 * Combines the original speaker information with the newly aligned timestamps
 */
export const reconstructSpeakerTags = (
    alignedWords: MatchedWord[], 
    originalSpeakerTags: SpeakerTagInfo[]
): MatchedWord[] => {
    const reconstructed = [...alignedWords];
    
    // Apply speaker tags to the appropriate words
    originalSpeakerTags.forEach(tagInfo => {
        if (tagInfo.position < reconstructed.length) {
            // Mark this word as a paragraph start with speaker
            reconstructed[tagInfo.position] = {
                ...reconstructed[tagInfo.position],
                isParagraphStart: true,
                speakerLabel: tagInfo.speaker,
                // If original had a timestamp and this word now has a timestamp, prefer the MFA/Whisper one
                // But mark that this originally had a timestamp for reference
            };
            
            // Apply speaker to subsequent words until next speaker change
            for (let i = tagInfo.position + 1; i < reconstructed.length; i++) {
                // Stop if we hit another speaker tag
                if (originalSpeakerTags.some(tag => tag.position === i)) {
                    break;
                }
                reconstructed[i] = {
                    ...reconstructed[i],
                    speakerLabel: tagInfo.speaker
                };
            }
        }
    });
    
    return reconstructed;
};


export const formatTimestamp = (seconds: number): string => {
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

export const parseTimestamp = (timestamp: string): number | null => {
    const parts = timestamp.split(':').map(part => parseFloat(part.replace(',', '.')));
    if (parts.some(isNaN)) return null;

    let seconds = 0;
    try {
        if (parts.length === 3) { // HH:MM:SS.ms
            seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) { // MM:SS.ms
            seconds = parts[0] * 60 + parts[1];
        } else if (parts.length === 1) { // SS.ms
            seconds = parts[0];
        } else {
            return null; // Invalid format
        }
    } catch {
        return null;
    }

    return isNaN(seconds) ? null : seconds;
};

/**
 * Adds empty line paragraphs between speaker changes for better visual separation
 * This function processes a transcript after MFA/Whisper alignment to ensure
 * that each speaker paragraph is separated by a single empty line
 */
export const addSpeakerSeparationLines = (words: MatchedWord[]): MatchedWord[] => {
    if (words.length === 0) return words;
    
    const result: MatchedWord[] = [];
    let lastSpeaker: string | undefined = undefined;
    
    words.forEach((word, index) => {
        // Check if this is a new speaker (different from previous speaker)
        if (word.isParagraphStart && word.speakerLabel && word.speakerLabel !== lastSpeaker && lastSpeaker !== undefined) {
            // Insert an empty line paragraph before the new speaker
            result.push({
                number: 0, // Will be renumbered later
                punctuated_word: '',
                cleaned_word: '',
                start: null,
                end: null,
                isParagraphStart: true,
                speakerLabel: undefined
            });
        }
        
        result.push({ ...word });
        
        // Update last speaker if this word has a speaker label
        if (word.speakerLabel) {
            lastSpeaker = word.speakerLabel;
        }
    });
    
    // Renumber all words
    return result.map((word, index) => ({ ...word, number: index + 1 }));
};

export const formatTranscriptForExport = (words: MatchedWord[]): string => {
    if (words.length === 0) return '';

    let output = '';
    let currentParagraph: string[] = [];
    let currentSpeaker: string | undefined = undefined;
    let currentTimestamp: string | null = null;

    words.forEach((word) => {
        if (word.isParagraphStart) {
            // If it's a new paragraph start, finalize the previous one.
            if (currentParagraph.length > 0) {
                let line = '';
                if (currentTimestamp) {
                    line += `${currentTimestamp} `;
                }
                if (currentSpeaker) {
                    line += `${currentSpeaker}: `;
                }
                line += currentParagraph.join(' ');
                output += line + '\n\n';
            }

            // Start a new paragraph
            currentParagraph = [word.punctuated_word];
            currentSpeaker = word.speakerLabel;
            currentTimestamp = word.start !== null ? formatTimestamp(word.start) : null;
        } else {
            // Continue the current paragraph
            currentParagraph.push(word.punctuated_word);
        }
    });

    // Add the very last paragraph
    if (currentParagraph.length > 0) {
        let line = '';
        if (currentTimestamp) {
            line += `${currentTimestamp} `;
        }
        if (currentSpeaker) {
            line += `${currentSpeaker}: `;
        }
        line += currentParagraph.join(' ');
        output += line + '\n';
    }

    return output;
};
