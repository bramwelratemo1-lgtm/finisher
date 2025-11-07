import React, { useState } from 'react';
import { useData } from '../contexts/DataContext';

const DriftCorrection: React.FC = () => {
    const { driftOffset, setDriftOffset, applyDriftCorrection, audioRef } = useData();
    const [direction, setDirection] = useState<'forward' | 'backward'>('backward');
    const [startTime, setStartTime] = useState<number | null>(null);

    const handleDriftChange = (amount: number) => {
        const newOffset = direction === 'forward' ? driftOffset + amount : driftOffset - amount;
        setDriftOffset(newOffset);
    };

    const handleSetStartTime = () => {
        if (audioRef.current) {
            setStartTime(audioRef.current.currentTime);
        }
    };

    const handleApply = () => {
        applyDriftCorrection(startTime ?? undefined);
        setStartTime(null);
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
            <input
                type="number"
                value={startTime ?? ''}
                onChange={(e) => setStartTime(parseFloat(e.target.value))}
                placeholder="Start time (s)"
                className="bg-gray-800 text-white w-24 text-center"
            />
            <button onClick={handleSetStartTime} className="bg-gray-700 text-white rounded px-3 py-1">Set Current</button>
            <button onClick={handleApply} className="bg-blue-600 text-white rounded px-3 py-1">Apply</button>
        </div>
    );
};

export default DriftCorrection;
