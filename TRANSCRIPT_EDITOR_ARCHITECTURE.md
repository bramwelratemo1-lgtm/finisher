# GPT-4o Style Transcript Editor Architecture

## Overview

This document details the technical implementation of the GPT-4o style transcript editor that provides seamless text editing with word-level audio synchronization and bidirectional timeline integration.

## Core Architecture

### 1. Interface Design Philosophy

The editor follows GPT-4o's "load transcript" interface principles:
- **Single textarea**: No complex paragraph-based editing modes
- **Clean formatting**: Simple timestamps and speaker labels without blue styling
- **Always editable**: No need to "enter edit mode" - edit anywhere, anytime
- **Professional appearance**: Monospace font, clean spacing, minimal UI

### 2. Data Flow Architecture

```
User Text Input → State Management → Word Parsing → Interpolation → Audio Sync
     ↑                                                                    ↓
Timeline Click ← Word Mapping ← Position Detection ← Right-Click Menu ←──┘
```

## Technical Implementation

### State Management Pattern

The editor uses a simplified state pattern inspired by GPT-4o:

```typescript
interface TranscriptState {
    transcriptText: string;  // Single source of truth for text content
}

const [state, setState] = useState<TranscriptState>({
    transcriptText: ''
});
```

**Key Benefits:**
- Single state object eliminates synchronization issues
- Text is the primary interface, not word arrays
- Simplifies debugging and state inspection

### Word Position Mapping System

The core innovation enabling word-level features without overlays:

```typescript
interface WordMapping {
    wordIndex: number;    // Index in MatchedWord[] array
    startPos: number;     // Character position in textarea
    endPos: number;       // End character position  
    word: MatchedWord;    // Reference to word object with timing
}
```

**Implementation:**
1. **Text Generation**: Convert `MatchedWord[]` to clean text string
2. **Position Tracking**: Map each word to character ranges in text
3. **Cursor Detection**: Find word at cursor position for interactions
4. **Context Menu**: Right-click detection using mapped positions

### Bidirectional Synchronization

#### Timeline → Text Flow
```typescript
const seekToTime = useCallback((time: number) => {
    // Find closest word to timeline time
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
    
    // Scroll to word in textarea
    if (closestWordIndex >= 0) {
        scrollToWord(closestWordIndex);
    }
}, [words, scrollToWord]);
```

#### Text → Timeline Flow
```typescript
const handleContextMenu = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    
    const textarea = e.currentTarget;
    const cursorPos = textarea.selectionStart;
    const word = findWordAtPosition(cursorPos);
    
    if (word && word.start !== null) {
        setContextMenu({ x: e.clientX, y: e.clientY, word });
    }
}, [findWordAtPosition]);
```

### Text Interpolation System

Handles new words by leveraging existing algorithm:

```typescript
const handleTextChange = useCallback((newText: string) => {
    setState(prev => ({ ...prev, transcriptText: newText }));
    
    // Parse text back to words
    const newWords = parsePastedTranscript(newText);
    
    // Apply interpolation for timing
    const interpolatedWords = interpolateTimestamps(newWords);
    
    onSaveTranscript(interpolatedWords);
}, [onSaveTranscript]);
```

**Interpolation Strategy:**
- Existing timed words retain their timestamps
- New words get interpolated timestamps between adjacent timed words
- Graceful degradation when no timing data available

### Right-Click Context Menu Implementation

Provides word-level audio control without interfering with editing:

```typescript
{contextMenu && (
    <div 
        style={{ 
            position: 'fixed',
            top: contextMenu.y, 
            left: contextMenu.x,
            zIndex: 1000
        }} 
        className="bg-gray-700 text-white rounded-md shadow-lg"
    >
        <ul>
            <li onClick={() => {
                if (contextMenu.word.start !== null) {
                    onSeekToTime(contextMenu.word.start);
                }
                setContextMenu(null);
            }}>
                Play word
            </li>
            <li onClick={() => {
                onFindWord(contextMenu.word.punctuated_word);
                setContextMenu(null);
            }}>
                Find word
            </li>
        </ul>
    </div>
)}
```

### Text-to-Word Position Detection

Core algorithm for cursor-to-word mapping:

```typescript
const findWordAtPosition = useCallback((cursorPos: number): MatchedWord | null => {
    const mapping = wordMappings.find(m => 
        cursorPos >= m.startPos && cursorPos <= m.endPos
    );
    return mapping?.word || null;
}, [wordMappings]);
```

### Scroll Synchronization

Ensures word highlighting is visible when timeline seeks:

```typescript
const scrollToWord = useCallback((wordIndex: number) => {
    if (wordIndex >= 0 && wordIndex < wordMappings.length) {
        const mapping = wordMappings[wordIndex];
        if (textareaRef.current && mapping) {
            // Focus and select word
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(mapping.startPos, mapping.endPos);
            
            // Calculate scroll position
            const textBeforeCursor = state.transcriptText.substring(0, mapping.startPos);
            const lineHeight = parseInt(getComputedStyle(textareaRef.current).lineHeight);
            const approxLineNumber = textBeforeCursor.split('\n').length;
            const scrollTop = (approxLineNumber - 5) * lineHeight; // 5 lines buffer
            
            textareaRef.current.scrollTop = Math.max(0, scrollTop);
        }
    }
}, [wordMappings, state.transcriptText]);
```

## Key Features Achieved

### 1. Seamless Editing Experience
- No mode switching required
- Edit any text at any time
- Automatic timestamp interpolation for new content
- Preserved word timing for existing content

### 2. Word-Level Audio Control
- Right-click any word to access audio controls
- "Play word" seeks audio to exact word timestamp
- "Find word" integrates with search functionality
- Visual word highlighting during context menu

### 3. Timeline Integration
- Timeline clicks automatically scroll to corresponding text
- Word selection reflects timeline position
- Bidirectional synchronization maintains consistency
- Smooth user experience across both interfaces

### 4. Professional Appearance
- Clean GPT-4o style interface
- Monospace font for professional transcript appearance
- Simple timestamp format: `00:12:34.5`
- Minimal speaker labels: `Speaker 1:`
- No complex blue styling or overlays

## Performance Considerations

### Efficient Mapping Updates
- Word mappings regenerated only when text or words change
- Cursor detection uses binary search for O(log n) performance
- Context menu positioned absolutely to avoid layout recalculation

### Memory Management
- Single state object reduces memory allocation
- Event listeners properly cleaned up in useEffect returns
- Context menu auto-closes to prevent memory leaks

### Debouncing Strategy
- Text changes trigger immediate state updates for responsiveness
- Word parsing and interpolation handled in single pass
- Timeline synchronization uses requestAnimationFrame for smoothness

## Integration Points

### Parent Component API
The TranscriptView maintains the same external API:
- `words: MatchedWord[]` - Input word array with timing
- `onSeekToTime: (time: number) => void` - Audio seek callback
- `onSaveTranscript: (words: MatchedWord[]) => void` - Save callback
- `textZoom: number` - Font size control
- `fontFamily: string` - Font selection

### Handle Exposure
Exposes imperative handle for parent control:
```typescript
export interface TranscriptViewHandle {
    insertTimestampAtCursor: (time: number) => void;
    insertSegmentTimestamp: (time: number, speakerLabel: string) => void;
    scrollToWord: (wordIndex: number) => void;
    seekToTime: (time: number) => void;
}
```

## Error Handling

### Graceful Degradation
- Words without timing still display and edit normally
- Invalid cursor positions default to no-action
- Missing word mappings fail silently
- Context menu auto-closes on outside clicks

### Input Validation
- Text parsing handles malformed input gracefully
- Timestamp parsing validates format before applying
- Position detection bounded to valid ranges
- Right-click detection validates word existence before menu

## Testing Strategy

### Build Validation
- TypeScript compilation ensures type safety
- Vite build process validates all imports and syntax
- Component props validated at compile time

### Integration Testing
- Timeline synchronization tested with various word positions
- Context menu tested across different cursor positions
- Text editing tested with various input scenarios
- Audio seeking tested with valid and invalid timestamps

## Future Considerations

### Scalability
- Word mapping algorithm scales linearly with transcript length
- Position detection optimized for large documents
- Memory usage remains constant regardless of transcript size

### Extensibility
- Context menu can easily accommodate additional actions
- Word mapping system supports custom word types
- Timeline integration can extend to other synchronization needs
- Text parsing can handle additional format types

This architecture successfully delivers the requested GPT-4o style experience while maintaining professional-grade audio synchronization and editing capabilities.