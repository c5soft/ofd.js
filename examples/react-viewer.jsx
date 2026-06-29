/**
 * @file OFD.js - React Integration Example
 * @description 演示如何在 React 中使用 OFD.js
 */

import React, { useState, useRef } from 'react';
import { parseOfdDocument, renderOfd } from '@ycsx/ofdjs';

export const OfdViewer = () => {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const containerRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    parseOfdDocument({
      ofd: file,
      success: (ofdDoc) => {
        const screenWidth = containerRef.current?.offsetWidth || 1024;
        const pageElements = renderOfd(screenWidth, ofdDoc);

        // 将DOM元素转换为可渲染的形式
        const pageData = pageElements.map((element) => ({
          id: element.id,
          html: element.outerHTML,
        }));

        setPages(pageData);
        setFileInfo({
          name: file.name,
          size: file.size,
          pageCount: pageData.length,
          loadedAt: new Date().toLocaleString(),
        });
        setLoading(false);
      },
      fail: (err) => {
        setError(err.message || '文件加载失败');
        setLoading(false);
      },
    });
  };

  const handleClear = () => {
    setPages([]);
    setFileInfo(null);
    setError(null);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>OFD 文档查看器</h1>
        <p>使用 React + OFD.js</p>
      </div>

      <div style={styles.controls}>
        <div style={styles.controlGroup}>
          <label htmlFor="fileInput">选择 OFD 文件：</label>
          <input
            id="fileInput"
            type="file"
            accept=".ofd"
            onChange={handleFileChange}
            disabled={loading}
            style={styles.fileInput}
          />
        </div>

        {fileInfo && (
          <button onClick={handleClear} style={styles.button}>
            清空文档
          </button>
        )}
      </div>

      {loading && <div style={styles.loading}>正在加载...</div>}

      {error && <div style={styles.error}>错误: {error}</div>}

      {fileInfo && (
        <div style={styles.info}>
          <p>
            <strong>文件名:</strong> {fileInfo.name}
          </p>
          <p>
            <strong>页数:</strong> {fileInfo.pageCount}
          </p>
          <p>
            <strong>大小:</strong> {(fileInfo.size / 1024).toFixed(2)} KB
          </p>
          <p>
            <strong>加载时间:</strong> {fileInfo.loadedAt}
          </p>
        </div>
      )}

      <div ref={containerRef} style={styles.viewer}>
        {pages.length === 0 && !loading && (
          <p style={styles.emptyState}>选择一个 OFD 文件开始查看...</p>
        )}
        {pages.map((page) => (
          <div
            key={page.id}
            style={styles.page}
            dangerouslySetInnerHTML={{ __html: page.html }}
          />
        ))}
      </div>
    </div>
  );
};

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '30px',
    textAlign: 'center',
  },
  controls: {
    padding: '30px',
    borderBottom: '1px solid #e0e0e0',
    background: '#f9f9f9',
  },
  controlGroup: {
    marginBottom: '20px',
  },
  fileInput: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    marginTop: '8px',
  },
  button: {
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  loading: {
    padding: '40px',
    textAlign: 'center',
    color: '#667eea',
    fontSize: '16px',
  },
  error: {
    padding: '15px',
    margin: '20px 30px',
    background: '#ffebee',
    color: '#c62828',
    borderLeft: '4px solid #f44336',
    borderRadius: '4px',
  },
  info: {
    padding: '20px 30px',
    background: '#f0f7ff',
    borderLeft: '4px solid #2196f3',
    borderRadius: '4px',
    margin: '20px 30px 0',
  },
  viewer: {
    padding: '30px',
    minHeight: '400px',
    background: '#f5f5f5',
  },
  page: {
    marginBottom: '30px',
    background: 'white',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    borderRadius: '4px',
  },
  emptyState: {
    textAlign: 'center',
    color: '#999',
    padding: '40px',
  },
};

export default OfdViewer;
