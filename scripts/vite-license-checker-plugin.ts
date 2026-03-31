import * as checkerModule from 'license-checker-rseidelsohn'
import { promises as fs } from 'fs'
import path from 'path'

export default function viteLicenseCheckerPlugin() {
  let outDir = 'dist'

  return {
    name: 'vite-license-checker-plugin',

    configResolved(resolvedConfig: any) {
      outDir = resolvedConfig.build.outDir || outDir
    },

    closeBundle: async () => {
      console.log(`Generating licenses.txt in ${outDir} ...`)
      await generateLicenseFile(outDir)
    }
  };

  async function generateLicenseFile(outputDir: string) {
    try {
      // Resolve project root (where package.json lives)
      const projectPath = path.resolve()
      const outputPath = path.resolve(projectPath, outputDir, 'licenses.txt')

      await fs.mkdir(path.dirname(outputPath), { recursive: true })

      console.log(path.resolve(__dirname, 'vite-license-clarifications-file.json'))

      await new Promise<void>((resolve, reject) => {
        checkerModule.init({
          plainVertical: true,
          // excludePackages: 'nosleep.js@0.7.0;input-otp@1.4.2',
          // summary: true,
          // onlyAllow: 'MIT;ISC;BSD;Apache;CC0-1.0;CC-BY-3.0;CC-BY-4.0;LGPL-3.0;Unlicense;WTFPL;Python-2.0;UNLICENSED;BlueOak-1.0.0;MPL-2.0;Custom: LICENSE',
          clarificationsFile: path.resolve(__dirname, 'vite-license-clarifications-file.json'),
          out: outputPath,
          start: projectPath
        } as any, (err: Error) => {
          if (err) {
            console.error('Error generating licenses.txt:', err)
            reject(err)
          } else {
            console.log(`Successfully generated ${outputPath}`)
            resolve()
          }
        })
      })
    } catch (error) {
      console.error('Error in license checker plugin:', error)
    }
  }
}
