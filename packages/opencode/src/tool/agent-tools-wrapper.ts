import z from "zod"
import { Effect } from "effect"
import { spawnSync } from "child_process"
import * as Tool from "./tool"

const AGENT_TOOLS_PATH = "P:\\Data\\Personal\\agent-tools\\agent-tools.exe"

function execAgentTools(args: string[]): { status: number; stdout: string; stderr: string } {
  const proc = spawnSync(AGENT_TOOLS_PATH, args, { encoding: "utf8" })
  if (proc.error) {
    throw new Error(`Failed to run agent-tools: ${proc.error.message}`)
  }
  return {
    status: proc.status ?? 0,
    stdout: proc.stdout ?? "",
    stderr: proc.stderr ?? "",
  }
}

// 1. pdf_merge
export const PdfMergeTool = Tool.define(
  "pdf_merge",
  Effect.gen(function* () {
    return {
      description: "Merge multiple PDF files into a single PDF.",
      parameters: z.object({
        inputs: z.array(z.string()).describe("Paths to PDF files to merge"),
        output: z.string().describe("Path to save the merged PDF file"),
      }),
      execute: (params: { inputs: string[]; output: string }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["pdf", "merge", params.output, ...params.inputs])
          if (res.status !== 0) throw new Error(res.stderr || "PDF merge failed")
          return { title: "pdf_merge", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 2. pdf_split
export const PdfSplitTool = Tool.define(
  "pdf_split",
  Effect.gen(function* () {
    return {
      description: "Split a PDF into multiple files or extract specific pages.",
      parameters: z.object({
        input: z.string().describe("Path to input PDF file"),
        outputDir: z.string().describe("Directory to save output PDF pages"),
        pages: z.string().optional().describe("Optional: comma-separated pages/ranges (e.g. 1-3,5,7)"),
      }),
      execute: (params: { input: string; outputDir: string; pages?: string }) =>
        Effect.gen(function* () {
          const args = ["pdf", "split", params.input, params.outputDir]
          if (params.pages) args.push("--pages", params.pages)
          const res = execAgentTools(args)
          if (res.status !== 0) throw new Error(res.stderr || "PDF split failed")
          return { title: "pdf_split", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 3. pdf_rotate
export const PdfRotateTool = Tool.define(
  "pdf_rotate",
  Effect.gen(function* () {
    return {
      description: "Rotate specific pages of a PDF by a given angle.",
      parameters: z.object({
        input: z.string().describe("Path to input PDF file"),
        output: z.string().describe("Path to save the rotated PDF file"),
        angle: z.number().describe("Rotation angle in degrees (90, 180, 270)"),
        pages: z.string().optional().describe("Optional: comma-separated pages/ranges to rotate"),
      }),
      execute: (params: { input: string; output: string; angle: number; pages?: string }) =>
        Effect.gen(function* () {
          const args = ["pdf", "rotate", params.input, params.output, String(params.angle)]
          if (params.pages) args.push("--pages", params.pages)
          const res = execAgentTools(args)
          if (res.status !== 0) throw new Error(res.stderr || "PDF rotate failed")
          return { title: "pdf_rotate", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 4. pdf_search
export const PdfSearchTool = Tool.define(
  "pdf_search",
  Effect.gen(function* () {
    return {
      description: "Search for text occurrences within a PDF file.",
      parameters: z.object({
        input: z.string().describe("Path to the PDF file to search"),
        query: z.string().describe("Text to search for (case-insensitive)"),
      }),
      execute: (params: { input: string; query: string }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["pdf", "search", params.input, params.query])
          if (res.status !== 0) throw new Error(res.stderr || "PDF search failed")
          return { title: "pdf_search", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 5. markdown_to_pdf
export const MarkdownToPdfTool = Tool.define(
  "markdown_to_pdf",
  Effect.gen(function* () {
    return {
      description: "Convert a Markdown file to a styled PDF document using Microsoft Edge headless mode.",
      parameters: z.object({
        input: z.string().describe("Path to the input Markdown (.md) file"),
        output: z.string().describe("Path to save the output PDF file"),
      }),
      execute: (params: { input: string; output: string }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["doc", "md-to-pdf", params.input, params.output])
          if (res.status !== 0) throw new Error(res.stderr || "Markdown to PDF failed")
          return { title: "markdown_to_pdf", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 6. read_pptx
export const ReadPptxTool = Tool.define(
  "read_pptx",
  Effect.gen(function* () {
    return {
      description: "Extract and return all text from a PowerPoint (.pptx) presentation, organized slide-by-slide.",
      parameters: z.object({
        input: z.string().describe("Path to the .pptx presentation file"),
      }),
      execute: (params: { input: string }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["doc", "read-pptx", params.input])
          if (res.status !== 0) throw new Error(res.stderr || "Read PPTX failed")
          return { title: "read_pptx", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 7. read_docx
export const ReadDocxTool = Tool.define(
  "read_docx",
  Effect.gen(function* () {
    return {
      description: "Extract and return all paragraphs from a Word (.docx) document.",
      parameters: z.object({
        input: z.string().describe("Path to the .docx document file"),
      }),
      execute: (params: { input: string }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["doc", "read-docx", params.input])
          if (res.status !== 0) throw new Error(res.stderr || "Read DOCX failed")
          return { title: "read_docx", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 8. video_trim
export const VideoTrimTool = Tool.define(
  "video_trim",
  Effect.gen(function* () {
    return {
      description: "Trim a video.",
      parameters: z.object({
        input: z.string().describe("Path to input video file"),
        output: z.string().describe("Path to save the trimmed video"),
        startTime: z.string().describe("Start time (e.g. 00:01:20 or seconds)"),
        duration: z.string().optional().describe("Duration of the trim (e.g. 10 or 00:00:10)"),
      }),
      execute: (params: { input: string; output: string; startTime: string; duration?: string }) =>
        Effect.gen(function* () {
          const args = ["video", "trim", params.input, params.output, params.startTime]
          if (params.duration) args.push("--duration", params.duration)
          const res = execAgentTools(args)
          if (res.status !== 0) throw new Error(res.stderr || "Video trim failed")
          return { title: "video_trim", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 9. video_merge
export const VideoMergeTool = Tool.define(
  "video_merge",
  Effect.gen(function* () {
    return {
      description: "Merge multiple videos into one.",
      parameters: z.object({
        inputs: z.array(z.string()).describe("Paths to input video files"),
        output: z.string().describe("Path to save the merged video"),
      }),
      execute: (params: { inputs: string[]; output: string }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["video", "merge", params.output, ...params.inputs])
          if (res.status !== 0) throw new Error(res.stderr || "Video merge failed")
          return { title: "video_merge", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 10. video_speed
export const VideoSpeedTool = Tool.define(
  "video_speed",
  Effect.gen(function* () {
    return {
      description: "Change video playback speed.",
      parameters: z.object({
        input: z.string().describe("Path to input video file"),
        output: z.string().describe("Path to save the sped up video"),
        speed: z.number().describe("Speed multiplier (e.g. 1.5, 0.5)"),
      }),
      execute: (params: { input: string; output: string; speed: number }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["video", "speed", params.input, params.output, String(params.speed)])
          if (res.status !== 0) throw new Error(res.stderr || "Video speed failed")
          return { title: "video_speed", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 11. video_volume
export const VideoVolumeTool = Tool.define(
  "video_volume",
  Effect.gen(function* () {
    return {
      description: "Change video audio volume.",
      parameters: z.object({
        input: z.string().describe("Path to input video file"),
        output: z.string().describe("Path to save the modified video"),
        volume: z.number().describe("Volume multiplier (e.g. 2.0 = double, 0.5 = half)"),
      }),
      execute: (params: { input: string; output: string; volume: number }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["video", "volume", params.input, params.output, String(params.volume)])
          if (res.status !== 0) throw new Error(res.stderr || "Video volume failed")
          return { title: "video_volume", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 12. audio_trim
export const AudioTrimTool = Tool.define(
  "audio_trim",
  Effect.gen(function* () {
    return {
      description: "Trim an audio file.",
      parameters: z.object({
        input: z.string().describe("Path to input audio file"),
        output: z.string().describe("Path to save the trimmed audio"),
        startTime: z.string().describe("Start time (e.g. 00:00:30 or seconds)"),
        duration: z.string().optional().describe("Duration of the trim (e.g. 10 or 00:00:10)"),
      }),
      execute: (params: { input: string; output: string; startTime: string; duration?: string }) =>
        Effect.gen(function* () {
          const args = ["audio", "trim", params.input, params.output, params.startTime]
          if (params.duration) args.push("--duration", params.duration)
          const res = execAgentTools(args)
          if (res.status !== 0) throw new Error(res.stderr || "Audio trim failed")
          return { title: "audio_trim", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 13. audio_merge
export const AudioMergeTool = Tool.define(
  "audio_merge",
  Effect.gen(function* () {
    return {
      description: "Merge multiple audio files into one.",
      parameters: z.object({
        inputs: z.array(z.string()).describe("Paths to input audio files"),
        output: z.string().describe("Path to save the merged audio"),
      }),
      execute: (params: { inputs: string[]; output: string }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["audio", "merge", params.output, ...params.inputs])
          if (res.status !== 0) throw new Error(res.stderr || "Audio merge failed")
          return { title: "audio_merge", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 14. audio_speed
export const AudioSpeedTool = Tool.define(
  "audio_speed",
  Effect.gen(function* () {
    return {
      description: "Change audio playback speed.",
      parameters: z.object({
        input: z.string().describe("Path to input audio file"),
        output: z.string().describe("Path to save the sped up audio"),
        speed: z.number().describe("Speed multiplier (e.g. 1.25, 0.5)"),
      }),
      execute: (params: { input: string; output: string; speed: number }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["audio", "speed", params.input, params.output, String(params.speed)])
          if (res.status !== 0) throw new Error(res.stderr || "Audio speed failed")
          return { title: "audio_speed", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 15. audio_volume
export const AudioVolumeTool = Tool.define(
  "audio_volume",
  Effect.gen(function* () {
    return {
      description: "Change audio volume.",
      parameters: z.object({
        input: z.string().describe("Path to input audio file"),
        output: z.string().describe("Path to save the modified audio"),
        volume: z.number().describe("Volume multiplier (e.g. 1.5, 0.5)"),
      }),
      execute: (params: { input: string; output: string; volume: number }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["audio", "volume", params.input, params.output, String(params.volume)])
          if (res.status !== 0) throw new Error(res.stderr || "Audio volume failed")
          return { title: "audio_volume", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 16. audio_reverse
export const AudioReverseTool = Tool.define(
  "audio_reverse",
  Effect.gen(function* () {
    return {
      description: "Reverse an audio track.",
      parameters: z.object({
        input: z.string().describe("Path to input audio file"),
        output: z.string().describe("Path to save the reversed audio"),
      }),
      execute: (params: { input: string; output: string }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["audio", "reverse", params.input, params.output])
          if (res.status !== 0) throw new Error(res.stderr || "Audio reverse failed")
          return { title: "audio_reverse", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 17. convert_image
export const ConvertImageTool = Tool.define(
  "convert_image",
  Effect.gen(function* () {
    return {
      description: "Convert image format and resize.",
      parameters: z.object({
        input: z.string().describe("Path to input image file"),
        output: z.string().describe("Path to save the converted image"),
        width: z.number().optional().describe("Optional: resize width"),
        height: z.number().optional().describe("Optional: resize height"),
        quality: z.number().optional().describe("Optional: output quality (1-100)"),
      }),
      execute: (params: { input: string; output: string; width?: number; height?: number; quality?: number }) =>
        Effect.gen(function* () {
          const args = ["convert", "image", params.input, params.output]
          if (params.width) args.push("--width", String(params.width))
          if (params.height) args.push("--height", String(params.height))
          if (params.quality) args.push("--quality", String(params.quality))
          const res = execAgentTools(args)
          if (res.status !== 0) throw new Error(res.stderr || "Image conversion failed")
          return { title: "convert_image", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 18. convert_audio
export const ConvertAudioTool = Tool.define(
  "convert_audio",
  Effect.gen(function* () {
    return {
      description: "Convert audio format.",
      parameters: z.object({
        input: z.string().describe("Path to input audio file"),
        output: z.string().describe("Path to save the converted audio"),
      }),
      execute: (params: { input: string; output: string }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["convert", "audio", params.input, params.output])
          if (res.status !== 0) throw new Error(res.stderr || "Audio conversion failed")
          return { title: "convert_audio", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 19. convert_video
export const ConvertVideoTool = Tool.define(
  "convert_video",
  Effect.gen(function* () {
    return {
      description: "Convert video format.",
      parameters: z.object({
        input: z.string().describe("Path to input video file"),
        output: z.string().describe("Path to save the converted video"),
      }),
      execute: (params: { input: string; output: string }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["convert", "video", params.input, params.output])
          if (res.status !== 0) throw new Error(res.stderr || "Video conversion failed")
          return { title: "convert_video", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 20. github_list_repos
export const GithubListReposTool = Tool.define(
  "github_list_repos",
  Effect.gen(function* () {
    return {
      description: "List all GitHub repositories for the authenticated user.",
      parameters: z.object({
        filter: z.string().optional().describe("Optional: case-insensitive name filter string"),
      }),
      execute: (params: { filter?: string }) =>
        Effect.gen(function* () {
          const args = ["git", "list-repos"]
          if (params.filter) args.push("--filter", params.filter)
          const res = execAgentTools(args)
          if (res.status !== 0) throw new Error(res.stderr || "GitHub list repos failed")
          return { title: "github_list_repos", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 21. github_rename_repo
export const GithubRenameRepoTool = Tool.define(
  "github_rename_repo",
  Effect.gen(function* () {
    return {
      description: "Rename a GitHub repository.",
      parameters: z.object({
        repo: z.string().describe("The current owner/repo name (e.g. owner/repo)"),
        newName: z.string().describe("The new name of the repository (without owner)"),
      }),
      execute: (params: { repo: string; newName: string }) =>
        Effect.gen(function* () {
          const res = execAgentTools(["git", "rename-repo", params.repo, params.newName])
          if (res.status !== 0) throw new Error(res.stderr || "GitHub rename repo failed")
          return { title: "github_rename_repo", metadata: {}, output: res.stdout }
        }),
    }
  })
)

// 22. bundle_codebase
export const BundleCodebaseTool = Tool.define(
  "bundle_codebase",
  Effect.gen(function* () {
    return {
      description: "Recursively scan a directory and bundle all source files into a single Markdown document.",
      parameters: z.object({
        dir: z.string().describe("Root directory to scan and bundle"),
        output: z.string().describe("Output path for the bundled Markdown file"),
        maxFileSize: z.number().optional().describe("Optional: max file size in bytes to include (default: 200KB)"),
        extensions: z.array(z.string()).optional().describe("Optional: list of file extensions to include (e.g. ['.ts', '.py'])"),
      }),
      execute: (params: { dir: string; output: string; maxFileSize?: number; extensions?: string[] }) =>
        Effect.gen(function* () {
          const args = ["git", "bundle", params.dir, params.output]
          if (params.maxFileSize) args.push("--max-size", String(params.maxFileSize))
          if (params.extensions && params.extensions.length > 0) args.push("--ext", params.extensions.join(","))
          const res = execAgentTools(args)
          if (res.status !== 0) throw new Error(res.stderr || "Bundle codebase failed")
          return { title: "bundle_codebase", metadata: {}, output: res.stdout }
        }),
    }
  })
)
