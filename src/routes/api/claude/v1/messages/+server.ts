import { forwardToClaude } from '$lib/server/claudeProxy';

export const POST = ({ request }: { request: Request }) => forwardToClaude(request);
