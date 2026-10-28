import type { Platform, VideoReport } from '../../shared/types.js';

export interface VideoAdapter {
  id: string;
  name: string;
  platforms: Platform[];
  isReady(): boolean;
  analyze(url: string, platform: Platform): Promise<VideoReport>;
}
