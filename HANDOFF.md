# TRANSCRIPT EDITOR HANDOFF DOCUMENTATION

## CRITICAL REFINEMENTS - NEW PROCESSING APPROACH

### THE PROBLEM WITH PREVIOUS APPROACH
The previous implementation was **fundamentally flawed** due to destructive reparsing:

1. **Destructive Reparsing**: Every text change called `parsePastedTranscript()` + `interpolateTimestamps()` 
2. **MFA Timestamp Loss**: This destroyed precise MFA timestamps (e.g., `start: 12.456` became `start: null` then `start: 12.0`)
3. **Unnecessary Processing**: Minor edits (typing, Enter key) triggered full text reprocessing
4. **Data Corruption**: Even first words lost accuracy because keystroke #1 destroyed precision

### NEW REFINED APPROACH - PARAGRAPH PROCESSOR LOGIC

Based on the provided `paragraph_processor_v4.py`, we now implement a **precision-preserving** approach:

## 1. FORMATTED TRANSCRIPT PROCESSING

### Data Flow Architecture:
```
Formatted Transcript → Strip Speaker Tags → Match with MFA JSON → Assign Timestamps → Reconnect Speaker Tags
```

### Processing Steps:
1. **Parse Formatted Transcript**: Extract speaker labels and plain text using `extract_speaker_and_text()`
2. **Strip Speaker Timestamps**: Remove timestamps temporarily to enable clean text matching
3. **Match Text with MFA JSON**: Use sequential matching with lookahead window
4. **Assign Precise Timestamps**: Map MFA `start`/`end` to matched words
5. **Reconstruct with Speaker Tags**: Reattach speaker labels and timestamps to form original paragraph structure

## 2. MFA JSON MATCHING ALGORITHM

### Key Functions (from paragraph_processor_v4.py):

#### `normalize_token(w: str) -> str`:
```typescript
// Normalize for matching accuracy
w = w.toLowerCase()
w = w.replace("'", "'")                    // Normalize apostrophes  
w = w.strip(".,!?;:\"()[]{}")             // Strip punctuation
w = w.replace("'", "")                    // Remove apostrophes (sheriff's → sheriff)
w = w.replace("-", "")                    // Collapse hyphens
```

#### `tokens_close_match(t: str, a: str) -> bool`:
```typescript
// Handle exact matches and plural variations
if (t === a) return true;
if (t.endsWith("s") && t.slice(0, -1) === a) return true;  // sheriff vs sheriffs
if (a.endsWith("s") && a.slice(0, -1) === t) return true;  // sheriffs vs sheriff
```

#### `match_paragraph_words()`:
```typescript
// Sequential matching with lookahead window (default: 6 words)
// Uses 'cleaned_word' field from MFA JSON as primary matching source
// Advances index only on successful match, handles transcript word gaps
```

### Data Structures:

#### Input MFA JSON Format:
```json
[
  {
    "number": 1,
    "punctuated_word": "Hello,",
    "cleaned_word": "hello",
    "start": 12.456,
    "end": 12.789
  }
]
```

#### Internal MatchedWord Structure:
```typescript
interface MatchedWord {
  number: number;
  punctuated_word: string;
  cleaned_word: string;
  start: number | null;
  end: number | null;
  speakerLabel?: string;
  isParagraphStart?: boolean;
  mfaSource?: boolean;  // NEW: Tracks if timestamp came from MFA
}
```

## 3. EDITING BEHAVIOR - PRECISION PRESERVATION

### Word Lifecycle Management:

#### **Existing Words (MFA Timestamped)**:
- **Partial Edits**: Retain original MFA timestamps (`start: 12.456` stays `12.456`)
- **Complete Deletion**: Remove from JSON metadata only when entire word deleted
- **Text Changes**: Preserve `mfaSource: true` flag to prevent re-interpolation

#### **New Words Added**:
- **Detection**: Words not found in original MFA JSON during matching
- **Interpolation**: Apply `interpolateTimestamps()` ONLY to new words
- **Integration**: Insert interpolated words between MFA timestamped words in sequence

#### **Text Change Processing**:
```typescript
// INTELLIGENT CHANGE DETECTION
const isNewWordAdded = detectNewWords(oldText, newText);
const isWordDeleted = detectDeletedWords(oldText, newText);
const isMinorEdit = detectMinorEdit(oldText, newText);  // typing, punctuation

if (isNewWordAdded) {
  // Apply interpolation ONLY to new words
  const newWords = extractNewWords(newText, existingMfaWords);
  const interpolatedNewWords = interpolateTimestamps(newWords);
  mergeWithExistingMfaWords(interpolatedNewWords, existingMfaWords);
} else if (isMinorEdit) {
  // Preserve all existing MFA timestamps - NO PROCESSING
  preserveExistingTimestamps();
}
```

## 4. SPEAKER TAG RECONNECTION

### Speaker Pattern Recognition:
```regex
// Pattern: Optional timestamp + Speaker + Colon + Text
^(?:(?:\d+:)?\d{2}:\d{2}\.\d\s)?([^:]+):\s*(.+)

// Examples:
"0:00:07.8 S1: Hello world"     → speaker="S1", text="Hello world"
"S1: Hello world"               → speaker="S1", text="Hello world"  
"SPEAKER_01: Hello world"       → speaker="S1", text="Hello world"
```

### Speaker Normalization:
```typescript
// Convert various formats to standardized form
"SPEAKER_01" → "S1"
"SPEAKER_02" → "S2"  
"S1"         → "S1" (unchanged)
"John Doe"   → "John Doe" (unchanged)
```

### Paragraph Reconstruction:
```typescript
// Rebuild formatted transcript with timestamps
const reconstructedParagraph = `${formatTimestamp(firstWordStart)} ${speaker}: ${reconstructedText}`;
```

## 5. JSON METADATA MANAGEMENT

### Metadata Structure:
```typescript
interface TranscriptMetadata {
  mfaWords: MatchedWord[];           // Original MFA data (immutable)
  interpolatedWords: MatchedWord[];  // New words with interpolated timestamps
  wordMappings: {                    // Character position → word mapping for UI
    [charPos: number]: {
      word: MatchedWord;
      isMfaSource: boolean;
    }
  };
}
```

### Metadata Operations:
- **MFA Application**: Store original MFA words in `mfaWords` array (never modify)
- **New Word Addition**: Add to `interpolatedWords` array with interpolated timestamps
- **Word Deletion**: Remove from appropriate array based on `mfaSource` flag
- **Lookup for Playback**: Check `mfaWords` first (precise), then `interpolatedWords` (estimated)

## 6. EDITOR BEHAVIOR SPECIFICATIONS

### Enter Key Behavior:
- **Action**: Creates clean paragraph break with empty line between paragraphs
- **NO timestamp insertion**: Enter key is treated as formatting, not content change
- **Preserve structure**: Maintain speaker tags and existing word timestamps

### Right-Click Context Menu:
- **"Play word"**: Use precise MFA timestamp if `mfaSource: true`, interpolated if false
- **Timestamp accuracy**: Display timestamp precision indicator in context menu

### Cursor Position Management:
- **Preserve during edits**: Maintain cursor position during all text operations
- **No jumping**: Cursor stays at edit location, not end of text

## 7. IMPLEMENTATION PRIORITY

### Phase 1: Core Processing (IMMEDIATE)
1. Implement `extract_speaker_and_text()` function
2. Implement `match_paragraph_words()` with lookahead window
3. Implement MFA JSON → formatted transcript processing
4. Add `mfaSource` flag to track timestamp origin

### Phase 2: Editing Intelligence (IMMEDIATE)  
1. Replace destructive reparsing with intelligent change detection
2. Implement new word interpolation (preserve existing MFA words)
3. Add word deletion handling (remove from metadata only when fully deleted)

### Phase 3: Metadata Management (IMMEDIATE)
1. Implement JSON metadata structure for precise playback
2. Add word lookup system for right-click context menu
3. Ensure thread-safe metadata updates during editing

## 8. VALIDATION CRITERIA

### MFA Timestamp Accuracy:
- ✅ First word retains exact MFA timestamp (e.g., `12.456` not `12.0`)
- ✅ Existing words preserve timestamps during partial edits
- ✅ Only new words receive interpolated timestamps
- ✅ Word-level playback uses precise MFA data

### Editing Experience:
- ✅ Enter key creates clean paragraphs without unwanted timestamps
- ✅ Cursor position preserved during all editing operations
- ✅ No destructive reparsing on minor text changes
- ✅ Speaker tags and formatting preserved during edits

### Performance:
- ✅ No unnecessary reprocessing during typing
- ✅ Fast word lookup for right-click playback
- ✅ Efficient metadata management for large transcripts

## 9. TECHNICAL NOTES

### Critical Implementation Details:
- **Use `cleaned_word` field**: Primary matching source from MFA JSON
- **Lookahead window**: Default 6 words for matching flexibility  
- **Sequential advancement**: Advance MFA index only on successful matches
- **Gap handling**: Allow transcript words not in MFA (don't advance index)
- **Match quality**: 80% threshold for "fully matched" paragraphs

### Error Handling:
- **Unmatched paragraphs**: Preserve original format without timestamps
- **Partial matches**: Apply available timestamps, interpolate gaps
- **MFA format variations**: Handle number/punctuated_word/cleaned_word/start/end structure

This refined approach ensures **millisecond-precise MFA timestamps** are preserved during editing while providing intelligent interpolation for new content.