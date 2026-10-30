import { AtomicCssModulesWebpackPlugin } from '@zslabs/atomic-css-modules/webpack'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'

export default (_env, argv) => {
  const production = argv.mode === 'production'
  return {
    entry: './src/index.js',
    devtool: production ? false : 'eval-cheap-module-source-map',
    module: {
      rules: [
        {
          test: /\.css$/,
          use: [
            production ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader',
          ],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({ title: 'atomic-css-modules + webpack' }),
      ...(production ? [new MiniCssExtractPlugin()] : []),
      new AtomicCssModulesWebpackPlugin({ include: ['src/**/*.module.css'] }),
    ],
    devServer: { port: 3001, hot: true },
  }
}
