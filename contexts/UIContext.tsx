// FIX: import useRef from react
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ShortcutConfig, UIContextType } from '../types';
import { useData } from './DataContext';

const UIContext = createContext<UIContextType | null>(null);

export const useUI = () => {
    const context = useContext(UIContext);
    if (!context) throw new Error('useUI must be used within a UIProvider');
    return context;
};

const DEFAULT_SHORTCUTS: ShortcutConfig = {
    playPause: ' ',
    rewind: 'ArrowLeft',
    forward: 'ArrowRight',
    undo: 'Control+z',
    redo: 'Control+y',
    interpolateEdits: 'Control+s',
    toggleLineNumbers: 'Control+l',
    find: 'Control+f',
    replace: 'Control+h',
    driftForward: 'Control+ArrowRight',
    driftBackward: 'Control+ArrowLeft',
};

const loadInitialState = () => {
    try {
        const savedStateJSON = localStorage.getItem('autosave-ui-state');
        if (savedStateJSON) return JSON.parse(savedStateJSON);
    } catch (e) { console.error("Could not parse saved UI state", e); }
    return null;
};

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const initialSavedState = useRef(loadInitialState()).current;

    const [findQuery, setFindQuery] = useState('');
    const [replaceQuery, setReplaceQuery] = useState('');
    const [findReplaceVisible, setFindReplaceVisible] = useState(false);
    const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
    
    const [leftSidebarOpen, setLeftSidebarOpen] = useState(initialSavedState?.leftSidebarOpen ?? true);
    const [chatOpen, setChatOpen] = useState(initialSavedState?.chatOpen ?? false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isSpeakerEditorOpen, setIsSpeakerEditorOpen] = useState(false);
    const [isTextSpeakerEditorOpen, setIsTextSpeakerEditorOpen] = useState(false);
    const [currentTab, setCurrentTab] = useState<'editor' | 'virtual' | 'gemini' | 'gpt4o'>(initialSavedState?.currentTab ?? 'editor');

    const [isTimelineVisible, setIsTimelineVisible] = useState(initialSavedState?.isTimelineVisible ?? true);
    const [isLineNumbersVisible, setIsLineNumbersVisible] = useState(initialSavedState?.isLineNumbersVisible ?? true);
    const [timelineZoom, setTimelineZoom] = useState(initialSavedState?.timelineZoom ?? 1);
    const [textZoom, setTextZoom] = useState(initialSavedState?.textZoom ?? 1);
    const [volume, setVolume] = useState(initialSavedState?.volume ?? 1);
    const [lastPlaybackTime, setLastPlaybackTime] = useState(initialSavedState?.lastPlaybackTime ?? 0);

    const [shortcuts, setShortcuts] = useState<ShortcutConfig>(() => {
        try {
            const saved = localStorage.getItem('transcription-editor-shortcuts');
            return saved ? { ...DEFAULT_SHORTCUTS, ...JSON.parse(saved) } : DEFAULT_SHORTCUTS;
        } catch { return DEFAULT_SHORTCUTS; }
    });
    
    // Note: Shortcuts will be handled by the individual editors now
    // const { undo, redo, audioRef } = useData();

    useEffect(() => {
        const stateToSave = {
            leftSidebarOpen, chatOpen, isTimelineVisible, isLineNumbersVisible,
            timelineZoom, textZoom, volume, lastPlaybackTime, currentTab,
        };
        localStorage.setItem('autosave-ui-state', JSON.stringify(stateToSave));
    }, [leftSidebarOpen, chatOpen, isTimelineVisible, isLineNumbersVisible, timelineZoom, textZoom, volume, lastPlaybackTime, currentTab]);
    
    const updateShortcuts = (newShortcuts: ShortcutConfig) => {
        setShortcuts(newShortcuts);
        localStorage.setItem('transcription-editor-shortcuts', JSON.stringify(newShortcuts));
    };

    // Shortcuts are now handled by individual editors
    // useEffect(() => {
    //     const handleKeyDown = (e: KeyboardEvent) => {
    //         // ... keyboard shortcut handling
    //     };
    //     window.addEventListener('keydown', handleKeyDown);
    //     return () => window.removeEventListener('keydown', handleKeyDown);
    // }, [shortcuts]);

    const findNext = useCallback(() => {
        // This logic will be handled in the Editor component, which has access to the search matches.
        // This function is kept for context API consistency.
    }, []);

    const replaceNext = useCallback(() => {
        // This logic will be handled in the Editor component.
    }, []);

    const closeFindReplace = () => {
        setFindReplaceVisible(false);
        setFindQuery('');
        setReplaceQuery('');
        setActiveMatchIndex(-1);
    };

    const value: UIContextType = {
        leftSidebarOpen, setLeftSidebarOpen, chatOpen, setChatOpen, isSettingsOpen, setIsSettingsOpen,
        isSpeakerEditorOpen, setIsSpeakerEditorOpen, isTextSpeakerEditorOpen, setIsTextSpeakerEditorOpen,
        isTimelineVisible, setIsTimelineVisible, isLineNumbersVisible, setIsLineNumbersVisible,
        timelineZoom, setTimelineZoom, textZoom, setTextZoom, volume, setVolume,
        lastPlaybackTime, setLastPlaybackTime, shortcuts, updateShortcuts,
        currentTab, setCurrentTab,
        findQuery, setFindQuery, replaceQuery, setReplaceQuery, findReplaceVisible, setFindReplaceVisible,
        activeMatchIndex, setActiveMatchIndex, findNext, replaceNext, closeFindReplace,
    };

    return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};
