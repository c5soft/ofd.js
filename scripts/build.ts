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

  // Build IIFE format first (rename before ESM to avoid name collision)
  console.log("\n🔨 Building IIFE format...");
  const iifeArgs = [
    "bun", "build", "src/ofd.ts",
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
  await $`mv ${distDir}/ofd.js ${distDir}/ofd.min.js`;
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

  // Build ESM format
  console.log("\n🔨 Building ESM format...");
  // Externalize crypto - jsrsasign works without it in browsers
  await $`bun build src/ofd.ts --target=browser --format=esm --external:crypto --outdir=${distDir}`;
  console.log("✓ ESM build completed: dist/ofd.js");

  // Generate TypeScript declarations
  console.log("\n📝 Generating TypeScript declarations...");
  await $`bun x tsc --emitDeclarationOnly 2>/dev/null; true`;
  const srcDecl = path.join(distDir, "src", "ofd.d.ts");
  const destDecl = path.join(distDir, "ofd.d.ts");
  if (await Bun.file(srcDecl).exists()) {
    let content = await Bun.file(srcDecl).text();
    // Remove import of internal helpers from ofd_render
    content = content.replace(/^import.*\{.*calPageBox.*\}.*from.*ofd_render.*;\n/m, '');
    // Remove references to calPageBox, calPageBoxScale, renderPage from export shapes
    content = content.replace(/\b(calPageBox|calPageBoxScale|renderPage)\b\s*,?\s*/g, '');
    content = content.replace(/,\s*\]/g, ']');
    await Bun.write(destDecl, content);
    // Clean up generated sub-directories from tsc output
    await $`rm -rf ${distDir}/src ${distDir}/index.d.ts ${distDir}/jbig2 ${distDir}/ofd 2>/dev/null; true`;
  }
  console.log("✓ TypeScript declarations generated: dist/ofd.d.ts");
  console.log("✓ Removed internal API types: calPageBox, calPageBoxScale, renderPage");

  console.log("\n✅ Build completed successfully!\n");
}

// Parse command line arguments
const minify = process.argv.includes("--minify");

// Run the build
buildDist(minify).catch((error) => {
  console.error("\n❌ Build failed:", error);
  process.exit(1);
});
