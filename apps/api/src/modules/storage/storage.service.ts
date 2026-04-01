import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

/**
 * S3-compatible storage service.
 * Works with AWS S3, Cloudflare R2, and MinIO out of the box.
 *
 * Configuration:
 *   STORAGE_ENDPOINT   — custom endpoint (MinIO: http://localhost:9000, R2: https://<account>.r2.cloudflarestorage.com)
 *   STORAGE_BUCKET     — bucket name (default: creator-platform-uploads)
 *   STORAGE_REGION     — region (default: auto)
 *   STORAGE_ACCESS_KEY — access key
 *   STORAGE_SECRET_KEY — secret key
 *   STORAGE_PUBLIC_URL — public base URL for serving files (optional, for CDN/R2 public access)
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  readonly bucket: string;
  private readonly publicUrl: string | null;
  private readonly tempDir: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('STORAGE_ENDPOINT');
    const accessKey = this.config.get<string>('STORAGE_ACCESS_KEY');
    const secretKey = this.config.get<string>('STORAGE_SECRET_KEY');
    const region = this.config.get<string>('STORAGE_REGION', 'auto');

    this.bucket = this.config.get<string>('STORAGE_BUCKET', 'creator-platform-uploads');
    this.publicUrl = this.config.get<string>('STORAGE_PUBLIC_URL') ?? null;
    this.tempDir = join(process.cwd(), 'uploads', 'temp');

    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }

    if (endpoint && accessKey && secretKey) {
      this.client = new S3Client({
        endpoint,
        region,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        forcePathStyle: true, // Required for MinIO
      });
      this.logger.log(`Storage configured: ${endpoint} / bucket: ${this.bucket}`);
    } else {
      this.client = null;
      this.logger.warn('Storage not configured — STORAGE_ENDPOINT/ACCESS_KEY/SECRET_KEY missing');
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Generate a presigned PUT URL for client-side uploads.
   */
  async getUploadUrl(key: string, contentType: string, expiresIn = 3600): Promise<string> {
    this.ensureConfigured();
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client!, command, { expiresIn });
  }

  /**
   * Generate a presigned GET URL for private file access.
   */
  async getDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    this.ensureConfigured();
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client!, command, { expiresIn });
  }

  /**
   * Get a public URL for a key. Uses STORAGE_PUBLIC_URL if set, otherwise generates a presigned URL.
   */
  async getPublicUrl(key: string): Promise<string> {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    return this.getDownloadUrl(key);
  }

  /**
   * Upload a file from local filesystem to storage.
   */
  async uploadFile(key: string, filePath: string, contentType?: string): Promise<void> {
    this.ensureConfigured();
    const stream = createReadStream(filePath);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: stream,
      ContentType: contentType,
    });
    await this.client!.send(command);
    this.logger.debug(`Uploaded: ${key}`);
  }

  /**
   * Upload raw buffer/stream to storage.
   */
  async uploadBuffer(key: string, body: Buffer | Readable, contentType?: string): Promise<void> {
    this.ensureConfigured();
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    await this.client!.send(command);
    this.logger.debug(`Uploaded buffer: ${key}`);
  }

  /**
   * Download a file from storage to local filesystem.
   * Returns the local file path. Used for FFmpeg operations that need local files.
   */
  async downloadToLocal(key: string, localFileName?: string): Promise<string> {
    this.ensureConfigured();
    const fileName = localFileName ?? key.split('/').pop()!;
    const localPath = join(this.tempDir, `${Date.now()}-${fileName}`);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const response = await this.client!.send(command);

    await pipeline(response.Body as Readable, createWriteStream(localPath));
    this.logger.debug(`Downloaded to local: ${key} → ${localPath}`);
    return localPath;
  }

  /**
   * Check if an object exists in storage.
   */
  async exists(key: string): Promise<boolean> {
    this.ensureConfigured();
    try {
      await this.client!.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete an object from storage.
   */
  async delete(key: string): Promise<void> {
    this.ensureConfigured();
    await this.client!.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
    this.logger.debug(`Deleted: ${key}`);
  }

  private ensureConfigured(): void {
    if (!this.client) {
      throw new Error('Storage is not configured. Set STORAGE_ENDPOINT, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY.');
    }
  }
}
