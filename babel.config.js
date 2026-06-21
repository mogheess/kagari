module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Reanimated 4 uses the worklets Babel plugin; it must be listed last.
  plugins: ['react-native-worklets/plugin'],
};
