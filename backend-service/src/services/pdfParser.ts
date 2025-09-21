import pdfParse from 'pdf-parse';
import fs from 'fs';
import logger from '../utils/logger';
import { PDFContent } from '../types';

/**
 * PDF Parser Service
 * 
 * Handles PDF text extraction with error handling and text normalization.
 * Initially tried pdf2pic for OCR support but decided to keep it simple
 * for the MVP. OCR can be added later if needed.
 */
class PDFParserService {
  
  /**
   * Extract text content from PDF file
   * 
   * @param filePath - Path to the PDF file on disk
   * @returns Promise containing extracted text and metadata
   * @throws Error if PDF parsing fails
   */
  async extractText(filePath: string): Promise<PDFContent> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      
      // Clean up the extracted text
      const cleanedText = this.cleanText(data.text);
      
      return {
        text: cleanedText,
        pages: data.numpages,
        wordCount: this.countWords(cleanedText),
        metadata: data.metadata || {},
        info: data.info || {}
      };
    } catch (error) {
      logger.error('PDF parsing failed', { 
        filePath, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean and normalize extracted text
   * 
   * PDFs can have weird formatting, so we normalize whitespace
   * and remove non-printable characters that might interfere
   * with pattern matching.
   */
  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/[^\x20-\x7E\n]/g, '') // Remove non-printable chars
      .trim();
  }

  /**
   * Count words in text
   * Simple word counting - splits on whitespace and filters empty strings
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Split text into chunks for analysis
   * 
   * Large PDFs might need to be processed in chunks to avoid
   * API limits or memory issues. Not currently used but keeping
   * it here for future enhancement.
   */
  chunkText(text: string, maxChunkSize: number = 1000): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?]+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
      }
      currentChunk += sentence + '. ';
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}

// Export singleton instance
export default new PDFParserService();
