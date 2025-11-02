import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { resolve } from 'path';

const isLibraryBuild = process.env.BUILD_MODE === 'lib';

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	...(isLibraryBuild
		? {
				build: {
					lib: {
						entry: resolve(__dirname, 'src/index.ts'),
						name: 'JsonDiffMergeEditor',
						formats: ['es', 'cjs'],
						fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
					},
					rollupOptions: {
						external: (id) => {
							return (
								id === 'react' ||
								id === 'react-dom' ||
								id === 'react/jsx-runtime' ||
								id.startsWith('react/') ||
								id.startsWith('react-dom/')
							);
						},
						output: {
							globals: {
								react: 'React',
								'react-dom': 'ReactDOM',
								'react/jsx-runtime': 'react/jsx-runtime',
							},
							assetFileNames: (assetInfo) => {
								if (assetInfo.name === 'style.css') {
									return 'style.css';
								}
								return assetInfo.name || 'asset';
							},
						},
					},
					sourcemap: true,
					cssCodeSplit: false,
				},
			}
		: {
				build: {
					sourcemap: true,
					rollupOptions: {
						output: {
							manualChunks: {
								'monaco-editor': ['monaco-editor'],
							},
						},
					},
				},
			}),
});
