import type { ReportFormat } from './ReportFormat.js';

export interface ReportArtifact {
  readonly filePath: string;
  readonly fileName: string;
  readonly format: ReportFormat;
  readonly rowCount: number;
  readonly s3Uri?: string;
}
