const path = require("path");
const PluginA = require("../plugins/plugin-a");
const PluginB = require("../plugins/plugin-b");

module.exports = {
  mode: "development",
  entry: {
    main: path.resolve(__dirname, "./src/entry1.js"),
    second: path.resolve(__dirname, "./src/entry2.js"),
  },
  devtool: false,
  context: process.cwd(),
  output: {
    path: path.resolve(__dirname, "./build"),
    filename: "[name].js",
  },
  plugins: [new PluginA(), new PluginB()],
  resolve: {
    extensions: [".js", ".ts"],
  },
  module: {
    rules: [
      {
        test: /\.js/,
        use: [
          path.resolve(__dirname, "../loaders/loader-1.js"),
          path.resolve(__dirname, "../loaders/loader-2.js"),
        ],
      },
    ],
  },
};
