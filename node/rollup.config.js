import commonjs from '@rollup/plugin-commonjs'

export default [
	{
		input: './src/authentication/index',
		output: {
			file: 'build/authentication/index.js',
			format: 'cjs'
		},
		external: [ 'axios' ],
		plugins: [commonjs()]
	},
	{
		input: './src/data/index',
		output: {
			file: 'build/data/index.js',
			format: 'cjs'
		},
		external: [ 'redis' ],
		plugins: [commonjs()]
	},
	{
		input: './src/index',
		output: {
			file: 'build/index.js',
			format: 'cjs'
		},
		external: [ 'axios', 'redis' ],
		plugins: [commonjs()]
	}
]
