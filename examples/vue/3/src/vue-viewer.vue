/**
 * @file OFD.js - Vue 3 Integration Example
 * @description 演示如何在 Vue 3 中使用 OFD.js
 */

<template>
  <div class="ofd-viewer">
    <div class="header">
      <h1>OFD 文档查看器</h1>
      <p>使用 Vue 3 + OFD.js</p>
    </div>

    <div class="controls">
      <div class="control-group">
        <label for="fileInput">选择 OFD 文件：</label>
        <input
          id="fileInput"
          type="file"
          accept=".ofd"
          @change="handleFileChange"
          :disabled="loading"
        />
      </div>

      <button v-if="fileInfo" @click="handleClear" class="btn-clear">
        清空文档
      </button>
    </div>

    <div v-if="loading" class="loading">正在加载...</div>
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="fileInfo" class="info">
      <p><strong>文件名:</strong> {{ fileInfo.name }}</p>
      <p><strong>页数:</strong> {{ fileInfo.pageCount }}</p>
      <p><strong>大小:</strong> {{ formatSize(fileInfo.size) }}</p>
      <p><strong>加载时间:</strong> {{ fileInfo.loadedAt }}</p>
    </div>

    <div ref="containerRef" class="viewer">
      <p v-if="pageElements.length === 0 && !loading" class="empty-state">
        选择一个 OFD 文件开始查看...
      </p>
      <div ref="pageRef"></div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { parseOfdDocument, renderOfd } from 'ofdts';

const pages = ref([]);
const loading = ref(false);
const error = ref(null);
const fileInfo = ref(null);
const containerRef = ref(null);
const pageRef = ref(null);
const pageElements = ref([]);
const formatSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

const handleFileChange = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  pageElements.value = [];
  pageRef.value.innerHTML = '';
  loading.value = true;
  error.value = null;

  parseOfdDocument({
    ofd: file,
    success: (ofdDoc) => {
      const screenWidth = containerRef.value?.offsetWidth || 1024;
      pageElements.value = renderOfd(screenWidth, ofdDoc[0]);
      pageElements.value.forEach(element => {
        pageRef.value.appendChild(element);
      });
      loading.value = false;
    },
    fail: (err) => {
      console.log(err)
      error.value = err.message || '文件加载失败';
      loading.value = false;
    },
  });
};

const handleClear = () => {
  pageElements.value = [];
  fileInfo.value = null;
  error.value = null;
  document.getElementById('fileInput').value = '';
};
</script>

<style scoped>
.ofd-viewer {
  max-width: 1200px;
  margin: 0 auto;
  font-family: system-ui, -apple-system, sans-serif;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 30px;
  text-align: center;
}

.header h1 {
  margin-bottom: 10px;
}

.controls {
  padding: 30px;
  border-bottom: 1px solid #e0e0e0;
  background: #f9f9f9;
}

.control-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
}

input[type='file'] {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
}

.btn-clear {
  padding: 12px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: transform 0.3s;
}

.btn-clear:hover {
  transform: translateY(-2px);
}

.loading {
  padding: 40px;
  text-align: center;
  color: #667eea;
}

.error {
  padding: 15px;
  margin: 20px 30px;
  background: #ffebee;
  color: #c62828;
  border-left: 4px solid #f44336;
  border-radius: 4px;
}

.info {
  padding: 20px 30px;
  background: #f0f7ff;
  border-left: 4px solid #2196f3;
  border-radius: 4px;
  margin: 20px 30px 0;
}

.viewer {
  padding: 30px;
  min-height: 400px;
  background: #f5f5f5;
}

.page {
  margin-bottom: 30px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.empty-state {
  text-align: center;
  color: #999;
  padding: 40px;
}
</style>
