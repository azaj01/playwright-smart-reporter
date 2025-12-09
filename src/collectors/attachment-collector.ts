import * as fs from 'fs';
import type { TestResult } from '@playwright/test/reporter';
import type { AttachmentData } from '../types';

/**
 * Collects and processes test attachments (screenshots, videos, traces)
 */
export class AttachmentCollector {
  /**
   * Collect all attachments from a test result
   * @param result - Playwright TestResult
   * @returns Attachment data with base64 screenshots and file paths
   */
  collectAttachments(result: TestResult): AttachmentData {
    const attachments: AttachmentData = {
      screenshots: [],
      videos: [],
      traces: [],
    };

    // Collect screenshots
    const screenshots = result.attachments.filter(
      a => a.name === 'screenshot' && a.contentType.startsWith('image/')
    );

    for (const screenshot of screenshots) {
      if (screenshot.body) {
        const dataUri = `data:${screenshot.contentType};base64,${screenshot.body.toString('base64')}`;
        attachments.screenshots.push(dataUri);
      } else if (screenshot.path) {
        // Read file and convert to base64
        try {
          const imgBuffer = fs.readFileSync(screenshot.path);
          const dataUri = `data:${screenshot.contentType};base64,${imgBuffer.toString('base64')}`;
          attachments.screenshots.push(dataUri);
        } catch (err) {
          console.warn(`Failed to read screenshot: ${screenshot.path}`, err);
        }
      }
    }

    // Collect videos
    const videos = result.attachments.filter(
      a => a.name === 'video' && a.contentType.startsWith('video/')
    );

    for (const video of videos) {
      if (video.path) {
        attachments.videos.push(video.path);
      }
    }

    // Collect traces (NEW for PR #2)
    const traces = result.attachments.filter(
      a => a.name === 'trace' && a.path
    );

    for (const trace of traces) {
      if (trace.path) {
        attachments.traces.push(trace.path);
      }
    }

    return attachments;
  }

  /**
   * Get the first screenshot (for backwards compatibility)
   * @param attachments - Attachment data
   * @returns First screenshot data URI or undefined
   */
  getFirstScreenshot(attachments: AttachmentData): string | undefined {
    return attachments.screenshots[0];
  }

  /**
   * Get the first video path (for backwards compatibility)
   * @param attachments - Attachment data
   * @returns First video path or undefined
   */
  getFirstVideo(attachments: AttachmentData): string | undefined {
    return attachments.videos[0];
  }

  /**
   * Check if test has any attachments
   * @param attachments - Attachment data
   * @returns True if any attachments exist
   */
  hasAttachments(attachments: AttachmentData): boolean {
    return attachments.screenshots.length > 0 ||
           attachments.videos.length > 0 ||
           attachments.traces.length > 0;
  }
}
