// plugins/withPodfilePatches.js
//
// Config plugin that adds two post_install patches to the generated Podfile
// so they survive every `npx expo run:ios` / `npx expo prebuild` cycle.
//
// Patch 1 — SWIFT_VERSION = '5.9'
//   Expo SDK 55 + Xcode 16 (Swift 6.1): expo-modules-core triggers ~24 strict
//   concurrency errors under Swift 6 language mode. Pinning to 5.9 language
//   mode silences them while keeping the Swift 6.1 compiler's ABI/performance.
//
// Patch 2 — REACT_NATIVE_PRODUCTION preprocessor flag
//   In Debug builds, react/debug/flags.h auto-defines REACT_NATIVE_DEBUG
//   (when NDEBUG is absent). That selects the non-inline Sealable class whose
//   constructor is declared but NOT defined in the header — it lives inside
//   React-Fabric source. The prebuilt ReactNativeDependencies.xcframework
//   was compiled with REACT_NATIVE_PRODUCTION (inline Sealable, no exported
//   symbol). Result: linker error "Undefined symbol: Sealable::Sealable()".
//   Defining REACT_NATIVE_PRODUCTION on all pods aligns them with the prebuilt.
//
// Patch 3 — @MainActor conformance-list removal
//   Three expo-modules-core Swift files use "@MainActor ProtocolName" in a
//   protocol conformance list, which Xcode 16's Swift 5.9 compat mode rejects
//   as an "unknown attribute". We strip @MainActor from those three positions
//   (the class-level isolation is preserved via the base class).

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const POST_INSTALL_PATCH = `
    # -------------------------------------------------------------------------
    # Fix: Swift 5.9 language mode (avoids Swift 6 strict concurrency errors
    # in expo-modules-core when building with Xcode 16 / Swift 6.1 compiler)
    # -------------------------------------------------------------------------
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['SWIFT_VERSION'] = '5.9'
      end
    end

    # -------------------------------------------------------------------------
    # Fix 3: Remove @MainActor from conformance-list positions in expo-modules-core
    # (Swift 5.9 compat mode rejects @MainActor in that position)
    # -------------------------------------------------------------------------
    root = File.expand_path('..', __dir__)
    patches = {
      'node_modules/expo-modules-core/ios/Core/Views/SwiftUI/SwiftUIHostingView.swift' =>
        { from: ', @MainActor AnyExpoSwiftUIHostingView {', to: ', AnyExpoSwiftUIHostingView {' },
      'node_modules/expo-modules-core/ios/Core/Views/SwiftUI/SwiftUIVirtualView.swift' =>
        { from: ': @MainActor ExpoSwiftUI.ViewWrapper {', to: ': ExpoSwiftUI.ViewWrapper {' },
      'node_modules/expo-modules-core/ios/Core/Views/ViewDefinition.swift' =>
        { from: ': @MainActor AnyArgument {', to: ': AnyArgument {' },
    }
    patches.each do |relative_path, patch|
      file_path = File.join(root, relative_path)
      next unless File.exist?(file_path)
      content = File.read(file_path)
      if content.include?(patch[:from])
        File.write(file_path, content.gsub(patch[:from], patch[:to]))
        puts "[Podfile] Patched \#{File.basename(file_path)}"
      end
    end
`;

module.exports = function withPodfilePatches(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      const marker = '# withPodfilePatches applied';
      if (contents.includes(marker)) {
        return config; // already patched — idempotent
      }

      // The generated Podfile always has exactly this closing sequence inside
      // the post_install block. We insert our patches right after it.
      const ANCHOR = '    :ccache_enabled => ccache_enabled?(podfile_properties),\n    )\n  end\nend';
      const REPLACEMENT =
        '    :ccache_enabled => ccache_enabled?(podfile_properties),\n    )\n\n' +
        `    ${marker}\n` +
        POST_INSTALL_PATCH +
        '\n  end\nend';

      if (contents.includes(ANCHOR)) {
        contents = contents.replace(ANCHOR, REPLACEMENT);
      } else {
        // Fallback for slightly different formatting: insert a second post_install block
        // before the final `end` (closing the target block).
        const FALLBACK_ANCHOR = '\nend\n';
        const lastIdx = contents.lastIndexOf(FALLBACK_ANCHOR);
        if (lastIdx !== -1) {
          contents =
            contents.slice(0, lastIdx) +
            `\n\n  post_install do |installer|\n    ${marker}\n${POST_INSTALL_PATCH}\n  end` +
            FALLBACK_ANCHOR;
        }
      }

      fs.writeFileSync(podfilePath, contents, 'utf8');
      return config;
    },
  ]);
};
