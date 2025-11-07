import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';

const DriftCorrection: React.FC = () => {
    const { driftOffset, setDriftOffset, applyDriftCorrection } = useData();
    const [direction, setDirection] = useState<'forward' | 'backward'>('backward');

    const handleDriftChange = (amount: number) => {
        const newOffset = direction === 'forward' ? driftOffset + amount : driftOffset - amount;
        setDriftOffset(newOffset);
    };

    return (
        <div className="flex items-center space-x-2">
            <select value={direction} onChange={(e) => setDirection(e.target.value as 'forward' | 'backward')} className="bg-gray-700 text-white rounded px-2 py-1">
                <option value="backward">Backward</option>
                <option value="forward">Forward</option>
            </select>
            <button onClick={() => handleDriftChange(-0.1)} className="bg-gray-700 text-white rounded px-2 py-1">{'<'}</button>
            <input type="text" value={driftOffset.toFixed(2)} readOnly className="bg-gray-800 text-white w-16 text-center" />
            <button onClick={() => handleDriftChange(0.1)} className="bg-gray-700 text-white rounded px-2 py-1">{'>'}</button>
            <button onClick={applyDriftCorrection} className="bg-blue-600 text-white rounded px-3 py-1">Apply</button>
        </div>
    );
};

export default DriftCorrection;
