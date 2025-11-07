import React, { useEffect } from 'react';
import { useUI } from '../contexts/UIContext';

interface FindReplaceProps {
    onFindNext: () => void;
    onFindPrev: () => void;
    onReplace: () => void;
    onReplaceAll: () => void;
    matchesCount: number;
    currentMatchIndex: number;
}

const FindReplace: React.FC<FindReplaceProps> = ({ onFindNext, onFindPrev, onReplace, onReplaceAll, matchesCount, currentMatchIndex }) => {
    const { findQuery, setFindQuery, replaceQuery, setReplaceQuery, closeFindReplace } = useUI();

    useEffect(() => {
        // This effect now only handles the cleanup on unmount.
        return () => {
            // The closeFindReplace function in the context will reset the UI state.
        };
    }, [closeFindReplace]);

    return (
        <div className="absolute top-2 right-2 bg-gray-700 rounded-lg shadow-lg z-20 flex flex-col items-start p-2 border border-gray-600 text-sm gap-2 w-[450px]">
            <div className="flex items-center gap-2 w-full">
                <input
                    type="text"
                    placeholder="Find..."
                    value={findQuery}
                    onChange={(e) => setFindQuery(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-600 rounded-md px-2 py-1 focus:ring-brand-blue focus:border-brand-blue outline-none"
                />
                <span className="text-gray-400 w-24 text-center font-mono">
                    {matchesCount > 0 ? `${currentMatchIndex + 1} / ${matchesCount}` : '0 / 0'}
                </span>
                <div className="flex items-center border-l border-gray-600 ml-auto pl-2">
                    <button onClick={onFindPrev} disabled={matchesCount === 0} className="p-1 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                        {'<'}
                    </button>
                    <button onClick={onFindNext} disabled={matchesCount === 0} className="p-1 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                        {'>'}
                    </button>
                    <button onClick={closeFindReplace} className="p-1 rounded hover:bg-gray-600 ml-2">
                        {'X'}
                    </button>
                </div>
            </div>
            <div className="flex items-center gap-2 w-full">
                <input
                    type="text"
                    placeholder="Replace with..."
                    value={replaceQuery}
                    onChange={(e) => setReplaceQuery(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-600 rounded-md px-2 py-1 focus:ring-brand-blue focus:border-brand-blue outline-none"
                />
                <div className="flex items-center gap-2 ml-auto pl-2">
                    <button onClick={onReplace} disabled={matchesCount === 0} className="px-3 py-1 rounded-md bg-gray-600 hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed">
                        Replace
                    </button>
                    <button onClick={onReplaceAll} disabled={matchesCount === 0} className="px-3 py-1 rounded-md bg-gray-600 hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed">
                        Replace All
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FindReplace;
