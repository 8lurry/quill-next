/*eslint-env node*/

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const common = require('../../../webpack.common.cjs');
const { merge } = require('webpack-merge');
require('webpack-dev-server');

module.exports = (env) =>
  merge(common, {
    entry: {
      'hierarchical-globals': {
        import: path.resolve(__dirname, 'hierarchical-globals.ts'),
        library: {
          name: 'HierarchicalGlobals',
          type: 'umd',
          export: 'default',
        },
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        publicPath: '/',
        filename: 'index.html',
        template: path.resolve(__dirname, 'index.html'),
        chunks: ['quill', 'hierarchical-globals'],
        inject: 'head',
        scriptLoading: 'blocking',
      }),
    ],
    devServer: {
      port: env.port,
      server: 'https',
      hot: false,
      liveReload: false,
      compress: true,
      client: {
        overlay: false,
      },
      webSocketServer: false,
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          include: [
            path.resolve(__dirname, '../../../src'),
            path.resolve(__dirname),
          ],
          use: ['babel-loader'],
        },
      ],
    },
  });
