import { createSignal, createEffect, createResource } from 'solid-js';
import { parseOfdDocument, renderOfd } from '../../../src';
// import { parseOfdDocument, renderOfd } from '../../../dist/ofd';

interface OfdFile {
  name: string;
  url: string;
}

export default function OfdViewer() {
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [fileInfo, setFileInfo] = createSignal<{ name: string; size: number; pageCount: number } | null>(null);
  const [pages, setPages] = createSignal<HTMLDivElement[]>([]);
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement | null>(null);
  const [selectedFile, setSelectedFile] = createSignal<string>('');

  // 获取文件列表
  const [fileList] = createResource<OfdFile[]>(async () => {
    const res = await fetch('/ofds/filelist.json');
    return res.json();
  });

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
  };

  const handleFileChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setPages([]);
    setFileInfo(null);

    parseOfdDocument({
      ofd: file,
      success: (ofdDocs:any) => {
        const container = containerRef();
        if (!container) {
          setLoading(false);
          return;
        }

        const screenWidth = container.clientWidth || 1024;
        const pageElements = renderOfd(screenWidth, ofdDocs[0]);

        setFileInfo({
          name: file.name,
          size: file.size,
          pageCount: pageElements.length,
        });
        setPages(pageElements);
        setLoading(false);
      },
      fail: (err:any) => {
        setError(err.message || '文件解析失败');
        setLoading(false);
      },
    });
  };

  const handleClear = () => {
    setPages([]);
    setFileInfo(null);
    setError(null);
    setLoading(false);
    setSelectedFile('');
    // 清空容器
    const container = containerRef();
    if (container) {
      container.innerHTML = '';
    }
  };

  const handleSelectFile = async (url: string, name: string) => {
    setSelectedFile(url);
    setLoading(true);
    setError(null);
    setPages([]);
    setFileInfo(null);

    try {
      // const response = await fetch(url);
      // const arrayBuffer = await response.arrayBuffer();
      const arrayBuffer = url;
      parseOfdDocument({
        ofd: arrayBuffer,
        success: (ofdDocs:any) => {
          const container = containerRef();
          if (!container) {
            setLoading(false);
            return;
          }

          const screenWidth = container.clientWidth || 1024;
          const pageElements = renderOfd(screenWidth, ofdDocs[0]);

          setFileInfo({
            name: name,
            size: NaN, //arrayBuffer.byteLength,
            pageCount: pageElements.length,
          });
          setPages(pageElements);
          setLoading(false);
        },
        fail: (err:any) => {
          setError(err.message || '文件解析失败');
          setLoading(false);
        },
      });
    } catch (err) {
      setError((err as Error).message || '文件加载失败');
      setLoading(false);
    }
  };

  // 将页面元素附加到容器
  createEffect(() => {
    const container = containerRef();
    if (!container) return;

    container.innerHTML = '';
    pages().forEach((page) => {
      container.appendChild(page);
      // 添加间距
      if (page !== pages()[pages().length - 1]) {
        const spacer = document.createElement('div');
        spacer.style.height = '20px';
        container.appendChild(spacer);
      }
    });
  });

  return (
    <div class="space-y-6">
      {/* 文件上传 */}
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center gap-4 flex-wrap">
          <label class="relative cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors">
            <span>本地上传 OFD 文件</span>
            <input
              type="file"
              accept=".ofd"
              onChange={handleFileChange}
              disabled={loading()}
              class="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
          {/* 远程文件选择下拉框 */}
          {fileList.loading ? (
            <span class="text-sm text-gray-500">加载文件列表...</span>
          ) : fileList.error ? (
            <span class="text-sm text-red-500">加载文件列表失败</span>
          ) : fileList() && fileList()!.length > 0 ? (
            <select name="ofdFileSelect"
              value={selectedFile()}
              onInput={(e) => {
                const value = (e.target as HTMLSelectElement).value;
                if (value) {
                  const file = fileList()!.find(f => f.url === value);
                  if (file) {
                    handleSelectFile(file.url, file.name);
                  }
                }
              }}
              disabled={loading()}
              class="px-4 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="" id="_SELECT_">-- 选择示例文件 --</option>
              {fileList()!.map(file => (
                <option value={file.url} id={file.name}>{file.name}</option>
              ))}
            </select>
          ) : null}
          {fileInfo() && (
            <button
              type="button"
              onClick={handleClear}
              class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md transition-colors"
            >
              清空
            </button>
          )}
        </div>

        {/* 文件信息 */}
        {fileInfo() && (
          <div class="mt-4 p-4 bg-gray-50 rounded-md">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <span class="text-sm font-medium text-gray-500">文件名</span>
                <p class="text-sm text-gray-900 mt-1">{fileInfo()!.name}</p>
              </div>
              <div>
                <span class="text-sm font-medium text-gray-500">大小</span>
                <p class="text-sm text-gray-900 mt-1">{formatSize(fileInfo()!.size)}</p>
              </div>
              <div>
                <span class="text-sm font-medium text-gray-500">页数</span>
                <p class="text-sm text-gray-900 mt-1">{fileInfo()!.pageCount}</p>
              </div>
            </div>
          </div>
        )}

        {/* 加载状态 */}
        {loading() && (
          <div class="mt-4 p-4 bg-blue-50 rounded-md">
            <p class="text-sm text-blue-600">正在解析文档...</p>
          </div>
        )}

        {/* 错误信息 */}
        {error() && (
          <div class="mt-4 p-4 bg-red-50 rounded-md">
            <p class="text-sm text-red-600">{error()}</p>
          </div>
        )}
      </div>

      {/* 文档容器 */}
      <div ref={setContainerRef} class="space-y-5" />
    </div>
  );
}
