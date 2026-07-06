import { createSignal } from 'solid-js';
import OfdViewer from './OfdViewer';
import './App.css';

function App() {
  return (
    <div class="min-h-screen bg-gray-100">
      <header class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <h1 class="text-xl font-bold text-gray-900">OFD 文档查看器</h1>
          <p class="mt-1 text-sm text-gray-500">SolidJS + TypeScript + UnoCSS</p>
        </div>
      </header>
      <main class="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <OfdViewer />
      </main>
    </div>
  );
}

export default App;
