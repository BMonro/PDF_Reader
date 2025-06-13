import React, { useState } from 'react';
import { Upload, FileText, Download, Sparkles, Droplet, DropletOffIcon, FileBox, BoomBoxIcon, Inbox } from 'lucide-react';
import './pdfReader.css';
import pdfImage from '../assets/icon.png';
import PdfViewer from '../components/pdfViewer'; // Import the new component

const PdfReader = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [showViewer, setShowViewer] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setUploadedFile(files[0]);
      // Simulate processing delay then show viewer
      setTimeout(() => {
        setShowViewer(true);
      }, 1500);
    }
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      setUploadedFile(files[0]);
      // Simulate processing delay then show viewer
      setTimeout(() => {
        setShowViewer(true);
      }, 1500);
    }
  };

  const handleBackToUpload = () => {
    setShowViewer(false);
    setUploadedFile(null);
  };

  // Show PDF Viewer if file is uploaded and processed
  if (showViewer && uploadedFile) {
    return <PdfViewer uploadedFile={uploadedFile} onBack={handleBackToUpload} />;
  }

  return (
    <div className="app-container">
      {/* Header */}
      <div className="header-section">
        
        <div className="container">
          <div className="header-content">
            <div className="header-text">
              <h1 className="main-title">
                PDFs Without Barriers
              </h1>
              <p className="subtitle">
                Analyze. Adapt. Use — without barriers.
              </p>
            </div>
            <div className="pdf-icon">
                <img src={pdfImage} alt="PDF Icon" className="icon" />
                </div>
          </div>

          {/* About Section */}
          <div className="about-section">
            <div className="section-title-wrapper">
              <h2 className="section-title">About us</h2>
              <div className="title-line"></div>
            </div>
            
            <div className="about-content">
              <p className="about-paragraph">
                We believe that information should be accessible to everyone — regardless of ability. Our platform 
                was created to help people overcome the barriers that can prevent them from accessing and processing digital content. 
                Whether you're dealing with visual impairments, learning disabilities, or simply need a more accessible way to engage with PDFs, 
                our tool is designed to make content more inclusive and user-friendly.
              </p>
              <p className="about-paragraph">
                Our mission is simple: to provide powerful, automated accessibility solutions that help users identify accessibility 
                issues in PDF documents, generate comprehensive reports, and take actionable steps toward making content more inclusive — our 
                platform helps you identify issues faster, easier, and more accurately than ever before.
              </p>
            </div>
          </div>

          {/* Upload Section */}
          <div className="upload-section">
            <div 
              className={`upload-area ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                className="file-input"
                id="file-upload"
              />
              
              
              <div className="upload-content">

                <div className="upload-actions">
                  <label htmlFor="file-upload" className="choose-file-btn">
                    Choose file
                  </label>
                </div>
                
                <p className="drop-text">Or drop files here</p>

                <div className="upload-icon-wrapper">
                  <div className="upload-icon">
                    <Inbox className="icon" />
                  </div>
                  <div className="upload-indicator"></div>
                  
                </div>
                
                
              </div>
              
              {uploadedFile && !showViewer && (
                <div className="file-uploaded">
                  <p className="uploaded-text">Processing: {uploadedFile.name}...</p>
                </div>
              )}
            </div>
          </div>

          {/* How it works Section */}
          <div className="how-it-works">
            <h2 className="section-title-main">How it works</h2>
            
            <div className="steps-container">
              {/* Step 1 */}
              <div className="step">
                <div className="step-icon-wrapper">
                  <div className="step-icon">
                    <Upload className="icon" />
                  </div>
                  <div className="step-number">1</div>
                </div>
                <h3 className="step-title">Upload your document</h3>
              </div>

              {/* Arrow 1 */}
              <div className="arrow">
                <div className="arrow-line">
                  <div className="arrow-head"></div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="step">
                <div className="step-icon-wrapper">
                  <div className="step-icon">
                    <FileText className="icon" />
                  </div>
                  <div className="step-number">2</div>
                </div>
                <h3 className="step-title">Convert your document</h3>
              </div>

              {/* Arrow 2 */}
              <div className="arrow">
                <div className="arrow-line">
                  <div className="arrow-head"></div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="step">
                <div className="step-icon-wrapper">
                  <div className="step-icon">
                    <Download className="icon" />
                  </div>
                  <div className="step-number">3</div>
                </div>
                <h3 className="step-title">Listen and download your document</h3>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfReader;