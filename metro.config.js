const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

module.exports = withNativeWind(config, {
  projectRoot,
  input: path.join(projectRoot, "src/global.css"),
  configPath: path.join(projectRoot, "tailwind.config.js"),
});
