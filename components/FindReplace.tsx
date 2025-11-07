import React, { useState, useEffect } from 'react';
import { useUI } from '../contexts/UIContext';

const FindReplace: React.FC = () => {
    const { findQuery, setFindQuery, replaceQuery, setReplaceQuery, findNext, replaceNext, closeFindReplace } = useUI();

    useEffect(() => {
        return () => {
            closeFindReplace();
        };
    }, [closeFindReplace]);

    return (
        <div className="absolute top-0 right-0 bg-gray-800 p-2 rounded-bl-lg">
            <div className="flex items-center space-x-2">
                <input type="text" value={findQuery} onChange={(e) => setFindQuery(e.target.value)} placeholder="Find" className="bg-gray-700 text-white rounded px-2 py-1" />
                <input type="text" value={replaceQuery} onChange={(e) => setReplaceQuery(e.target.value)} placeholder="Replace" className="bg-gray-700 text-white rounded px-2 py-1" />
                <button onClick={findNext} className="bg-gray-700 text-white rounded px-2 py-1">Next</button>
                <button onClick={replaceNext} className="bg-gray-700 text-white rounded px-2 py-1">Replace</button>
                <button onClick={closeFindReplace} className="bg-gray-700 text-white rounded px-2 py-1">X</button>
            </div>
        </div>
    );
};

export default FindReplace;
