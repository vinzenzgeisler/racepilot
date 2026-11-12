import type { RequestContext } from './context.js';
import type {
  ArtifactJobEnqueueInput,
  ArtifactJobEnqueueResult,
  ArtifactJobRepository,
} from './artifact-model.js';

export function queueArtifactJob(
  ctx: RequestContext,
  repository: ArtifactJobRepository,
  input: ArtifactJobEnqueueInput,
): Promise<ArtifactJobEnqueueResult> {
  return repository.enqueue(ctx, input);
}
