import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import type { SENDPreloadRequest } from '../../../services/attachment/models/SENDPreloadRequest.js';
import type { SENDPreloadResponse } from '../../../services/attachment/models/SENDPreloadResponse.js';
import type { SENDAttachmentService } from '../../../services/attachment/SENDAttachmentService.js';
import { tempDir, writeFixture } from '../../__tests__/helpers/testFiles.js';
import { AttachmentServiceGateway } from '../AttachmentServiceGateway.js';

const PRELOAD: SENDPreloadResponse = { preloadIdx: '0', key: 'K', url: 'https://s3', secret: 's', httpMethod: 'PUT' };

/** Records the calls the gateway makes to the attachment service. */
class FakeAttachmentService {
  public readonly preloads: ReadonlyArray<SENDPreloadRequest>[] = [];
  public uploaded: Buffer | undefined;

  public async preloadMany(requests: ReadonlyArray<SENDPreloadRequest>): Promise<ReadonlyArray<SENDPreloadResponse>> {
    await Promise.resolve();
    this.preloads.push(requests);
    return [PRELOAD];
  }

  public async uploadToPresignedUrl(_preload: SENDPreloadResponse, buffer: Buffer): Promise<string> {
    await Promise.resolve();
    this.uploaded = buffer;
    return 'v42';
  }
}

describe('AttachmentServiceGateway', () => {
  it('delegates preload and uploads the file content read from disk', async () => {
    const service = new FakeAttachmentService();
    const gateway = new AttachmentServiceGateway(service as unknown as SENDAttachmentService);
    const file = path.join(tempDir('dispatch-gateway'), 'atto.pdf');
    await writeFixture(file, '%PDF-1.4 content');

    assert.deepEqual(await gateway.preload([{ preloadIdx: '0', contentType: 'application/pdf', sha256: 'S' }]), [
      PRELOAD,
    ]);
    assert.equal(await gateway.upload(PRELOAD, file, 'S', 'application/pdf'), 'v42');
    assert.equal(service.uploaded?.toString('utf8'), '%PDF-1.4 content');
  });

  it('fails clearly when the file does not exist', async () => {
    const gateway = new AttachmentServiceGateway(new FakeAttachmentService() as unknown as SENDAttachmentService);
    await assert.rejects(
      gateway.upload(PRELOAD, path.join(tempDir('dispatch-gateway'), 'x.pdf'), 'S', 'application/pdf'),
    );
  });
});
