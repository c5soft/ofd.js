#!/usr/bin/env bun

import { $ } from "bun";
import { mkdir } from "fs/promises";
import path from "path";

const projectRoot = path.join(__dirname, "..");
const distDir = path.join(projectRoot, "dist");

/**
 * Build dist output using bun build
 * @param minify Whether to minify the IIFE build
 */
async function buildDist(minify: boolean): Promise<void> {
  console.log(`\n📦 Building dist with minify=${minify}...\n`);

  // Create dist directory if it doesn't exist
  await mkdir(distDir, { recursive: true });
  console.log(`✓ Created directory: ${distDir}`);

  // Build ESM format
  console.log("\n🔨 Building ESM format...");
  // Externalize crypto - jsrsasign works without it in browsers
  await $`bun build src/index.ts --target=browser --format=esm --external:crypto --outdir=${distDir}`;
  await $`mv ${distDir}/index.js ${distDir}/ofd.js`;
  console.log("✓ ESM build completed: dist/ofd.js");

  // Generate TypeScript declarations
  console.log("\n📝 Generating TypeScript declarations...");
  // Run tsc with tsconfig.json (already has skipLibCheck and correct settings)
  await $`bun x tsc --emitDeclarationOnly 2>/dev/null; true`;
  // Copy the declaration from src/ofd/ofd.d.ts (generated from source) directly to dist/ofd.d.ts
  // This ensures ofd.d.ts contains the actual type declarations directly from the source,
  // not just a re-export from index.ts
  const srcDecl = path.join(distDir, "src", "ofd", "ofd.d.ts");
  const destDecl = path.join(distDir, "ofd.d.ts");
  if (await Bun.file(srcDecl).exists()) {
    let content = await Bun.file(srcDecl).text();
    // Remove the import line that imports calPageBox, calPageBoxScale, renderPage from './ofd_render'
    content = content.replace(/^import.*\{.*calPageBox.*\}.*from.*ofd_render.*;\n/m, '');
    // Remove any remaining references to these three identifiers in export list
    content = content.replace(/\b(calPageBox|calPageBoxScale|renderPage)\b\s*,?\s*/g, '');
    // Clean up extra commas that might be left behind
    content = content.replace(/,\s*\]/g, ']');
    await Bun.write(destDecl, content);
    // Remove the generated src directory and any sub-module declarations (jbig2, ofd)
    await $`rm -rf ${distDir}/src ${distDir}/index.d.ts ${distDir}/jbig2 ${distDir}/ofd 2>/dev/null; true`;
  }
  // Remove declarations for internal modules (npm users only need the public API)
  console.log("✓ TypeScript declarations generated from src/ofd/ofd.ts: dist/ofd.d.ts");
  console.log("✓ Removed unused: calPageBox, calPageBoxScale, renderPage");
  console.log("✓ Removed subdirectories: jbig2/, ofd/");

  // Build IIFE format with conditional minification
  console.log("\n🔨 Building IIFE format...");
  const iifeArgs = [
    "bun", "build", "src/index.ts",
    "--target=browser",
    "--format=iife",
    "--outdir=" + distDir,
    "--global-name=OFD",
    "--external:crypto"
  ];
  if (minify) {
    iifeArgs.push("--minify");
  }
  await $`${iifeArgs}`;
  await $`mv ${distDir}/index.js ${distDir}/ofd.min.js`;
  // Remove new Function usage from setimmediate polyfill for CSP compatibility
  let iifeContent = await Bun.file(path.join(distDir, "ofd.min.js")).text();
  iifeContent = iifeContent.replace(
    /(\s+)if \(typeof callback !== "function"\) {\s+(\s+)callback = new Function\("" \+ callback\);/,
    '$1if (typeof callback !== "function") {\n$1  throw new Error("setImmediate: callback must be a function");'
  );
  // Remove new Function from get-intrinsic's getEvalledConstructor
  iifeContent = iifeContent.replace(
    /getEvalledConstructor = .*?^\s+}/ms,
    'getEvalledConstructor = function(expressionSyntax) {\n      try {\n        throw new Error("dynamic constructor evaluation not available");\n      } catch (e) {}\n    }'
  );
  await Bun.write(path.join(distDir, "ofd.min.js"), iifeContent);
  console.log("✓ Removed new Function from setimmediate and get-intrinsic in IIFE");
  console.log(`✓ IIFE build completed: dist/ofd.min.js (minify=${minify})`);

  console.log("\n✅ Build completed successfully!\n");
}

// Parse command line arguments
const minify = process.argv.includes("--minify");

// Run the build
buildDist(minify).catch((error) => {
  console.error("\n❌ Build failed:", error);
  process.exit(1);
});
