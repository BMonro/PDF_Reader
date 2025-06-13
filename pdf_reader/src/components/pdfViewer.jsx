import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Play, Pause, Volume2, Download, FileText, Settings } from 'lucide-react';
import './pdfViewer.css';

const PdfViewer = ({ uploadedFile, onBack }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(180); // 3 minutes example
  const [volume, setVolume] = useState(0.7);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages] = useState(5); // Example total pages
  
  const audioRef = useRef(null);
  const progressRef = useRef(null);

  // Simulate audio progress
  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime(prev => {
          if (prev >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, duration]);

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleProgressClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * duration;
    setCurrentTime(newTime);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const generateWaveformBars = (count = 50) => {
    return Array.from({ length: count }, (_, i) => {
      const height = Math.random() * 40 + 10;
      const isActive = (i / count) <= (currentTime / duration);
      return (
        <div
          key={i}
          className={`waveform-bar ${isActive ? 'active' : ''}`}
          style={{ height: `${height}px` }}
        />
      );
    });
  };

  return (
    <div className="pdf-viewer-container">
      <div className="pdf-viewer-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft className="back-icon" />
        </button>
        <div className="file-info">
          <FileText className="file-icon" />
          <span className="file-name">{uploadedFile?.name || 'Document.pdf'}</span>
        </div>
        <div className="header-actions">
          <button className="action-button">
            <Settings className="action-icon" />
          </button>
          <button className="action-button download-btn">
            <Download className="action-icon" />
            <span>Download</span>
          </button>
        </div>
      </div>

      <div className="pdf-viewer-content">
        {/* PDF Display Area */}
        <div className="pdf-display-section">
          <div className="pdf-preview">
            <div className="pdf-page">
              <div className="pdf-content">
                <div className="pdf-placeholder">
                  <FileText size={48} />
                  <p>PDF Content Preview</p>
                  <p className="page-info">Page {currentPage} of {totalPages}</p>
                </div>
              </div>
            </div>
            
            {/* Page Navigation */}
            <div className="page-navigation">
              <button 
                className="nav-button" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                Previous
              </button>
              <span className="page-counter">{currentPage} / {totalPages}</span>
              <button 
                className="nav-button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Audio Player Section */}
        <div className="audio-player-section">
          <div className="audio-player">
            <div className="player-header">
              <h3 className="player-title">Audio Version</h3>
              <div className="playback-speed">
                <select 
                  value={playbackSpeed} 
                  onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                  className="speed-select"
                >
                  <option value="0.5">0.5x</option>
                  <option value="0.75">0.75x</option>
                  <option value="1">1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>
              </div>
            </div>

            {/* Waveform Visualization */}
            <div className="waveform-container">
              <div className="waveform" onClick={handleProgressClick}>
                {generateWaveformBars()}
              </div>
              <div className="progress-line" style={{ width: `${(currentTime / duration) * 100}%` }} />
            </div>

            {/* Player Controls */}
            <div className="player-controls">
              <div className="control-group">
                <button className="control-button play-button" onClick={togglePlayPause}>
                  {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                </button>
                <div className="time-display">
                  <span className="current-time">{formatTime(currentTime)}</span>
                  <span className="separator">/</span>
                  <span className="total-time">{formatTime(duration)}</span>
                </div>
              </div>

              <div className="volume-control">
                <Volume2 size={20} />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="volume-slider"
                />
              </div>
            </div>
          </div>

          {/* Second Audio Track */}
          <div className="audio-player secondary">
            <div className="player-header">
              <h3 className="player-title">Alternative Version</h3>
              <div className="playback-speed">
                <select className="speed-select">
                  <option value="1">1x</option>
                </select>
              </div>
            </div>

            <div className="waveform-container">
              <div className="waveform">
                {generateWaveformBars(45)}
              </div>
            </div>

            <div className="player-controls">
              <div className="control-group">
                <button className="control-button play-button">
                  <Play size={24} />
                </button>
                <div className="time-display">
                  <span className="current-time">0:00</span>
                  <span className="separator">/</span>
                  <span className="total-time">2:45</span>
                </div>
              </div>

              <div className="volume-control">
                <Volume2 size={20} />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  defaultValue="0.7"
                  className="volume-slider"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Info Section */}
      <div className="info-section">
        <div className="conversion-info">
          <h4>Conversion Complete</h4>
          <p>Your PDF has been successfully converted to audio format with accessibility features enabled.</p>
        </div>
      </div>
    </div>
  );
};

export default PdfViewer;