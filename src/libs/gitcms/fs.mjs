import { promises as fs } from "fs";
import path from "path";

export default class FileManager {
  constructor(basePath, blogDir) {
    this.basePath = basePath;
    this.blogDir = blogDir || "";
    this.fullPath = path.join(basePath, this.blogDir);
  }

  async ensureBlogDirExists() {
    try {
      await fs.mkdir(this.fullPath, { recursive: true });
    } catch (error) {
      console.error("Failed to create blog directory:", error.message);
      throw error;
    }
  }

  async listMarkdownFiles() {
    await this.ensureBlogDirExists();

    try {
      const files = await fs.readdir(this.fullPath);
      const mdFiles = files.filter((file) => file.endsWith(".md"));

      const fileDetails = await Promise.all(
        mdFiles.map(async (filename) => {
          const filePath = path.join(this.fullPath, filename);
          const stats = await fs.stat(filePath);
          return {
            filename,
            modified: stats.mtime,
            size: stats.size,
          };
        }),
      );

      fileDetails.sort((a, b) => b.modified - a.modified);
      return fileDetails;
    } catch (error) {
      console.error("Failed to list markdown files:", error.message);
      throw error;
    }
  }

  async readFile(filename) {
    const filePath = path.join(this.fullPath, filename);
    if (!filePath.startsWith(this.fullPath)) {
      throw new Error("Invalid file path");
    }
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return content;
    } catch (error) {
      console.error("Failed to read file:", error.message);
      throw error;
    }
  }

  async createFile(filename, content) {
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "-");
    const finalFilename = sanitizedFilename.endsWith(".md")
      ? sanitizedFilename
      : `${sanitizedFilename}.md`;

    const filePath = path.join(this.fullPath, finalFilename);

    try {
      await fs.access(filePath);
      throw new Error("File already exists");
    } catch (error) {
      if (error.message === "File already exists") {
        throw error;
      }
    }

    await this.ensureBlogDirExists();
    await fs.writeFile(filePath, content, "utf-8");

    return finalFilename;
  }

  async updateFile(filename, content) {
    const filePath = path.join(this.fullPath, filename);
    if (!filePath.startsWith(this.fullPath)) {
      throw new Error("Invalid file path");
    }
    await fs.access(filePath);
    await fs.writeFile(filePath, content, "utf-8");
  }

  async deleteFile(filename) {
    const filePath = path.join(this.fullPath, filename);
    if (!filePath.startsWith(this.fullPath)) {
      throw new Error("Invalid file path");
    }
    await fs.unlink(filePath);
  }
}
