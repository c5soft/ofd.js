const path = require('path');

module.exports = {
  mode: 'production',
  entry: './index.js',
  output: {
    filename: 'ofd.min.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'OFD',
    libraryTarget: 'umd',
    globalObject: 'this',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  browsers: ['last 2 versions', '> 1%'],
                },
                useBuiltIns: 'usage',
                corejs: 3,
              }],
            ],
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js'],
  },
  devtool: false,
  performance: {
    maxEntrypointSize: 512000,
    maxAssetSize: 512000,
  },
};