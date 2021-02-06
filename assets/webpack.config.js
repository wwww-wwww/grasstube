const path = require('path');
const glob = require('glob');
const HardSourceWebpackPlugin = require('hard-source-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, options) => {
  const devMode = options.mode !== 'production';

  return {
    optimization: {
      minimizer: [
        new TerserPlugin({ cache: true, parallel: true, sourceMap: devMode }),
        new OptimizeCSSAssetsPlugin({})
      ]
    },
    entry: {
      'common': ['./js/common.js'].concat(glob.sync('./vendor/**/*.js')),
      'index': ['./js/index.js'].concat(glob.sync('./vendor/**/*.js')),
      'chat': ['./js/chat.js'].concat(glob.sync('./vendor/**/*.js')),
      'video': ['./js/video.js'].concat(glob.sync('./vendor/**/*.js')),
      'no_video': ['./js/no_video.js'].concat(glob.sync('./vendor/**/*.js')),
      'controls': ['./js/controls.js'].concat(glob.sync('./vendor/**/*.js')),
      'room': ['./js/room.js'].concat(glob.sync('./vendor/**/*.js')),
      'room2': ['./js/room2.js'].concat(glob.sync('./vendor/**/*.js')),
      'sign_in': ['./js/sign_in.js'].concat(glob.sync('./vendor/**/*.js')),
      'sign_up': ['./js/sign_up.js'].concat(glob.sync('./vendor/**/*.js')),
      'profile': ['./js/profile.js'].concat(glob.sync('./vendor/**/*.js'))
  },
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, '../priv/static/js'),
      publicPath: '/js/'
    },
    devtool: devMode ? 'eval-cheap-module-source-map' : undefined,
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader'
          }
        },
        {
          test: /\.[s]?css$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader',
            'sass-loader'
          ],
        }
      ]
    },
    plugins: [
      new MiniCssExtractPlugin({ filename: '../css/[name].css' }),
      new CopyWebpackPlugin([{ from: 'static/', to: '../' }])
    ]
    .concat(devMode ? [new HardSourceWebpackPlugin()] : [])
  }
};
