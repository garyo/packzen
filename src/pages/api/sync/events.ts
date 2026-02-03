export const prerender = false;

import type { APIRoute } from 'astro';
import { gt, eq, and, asc, sql } from 'drizzle-orm';
import { changeLog } from '../../../../db/schema';
import { getDatabaseConnection, getUserId } from '../../../lib/api-helpers';

export const GET: APIRoute = async (context) => {
  const db = getDatabaseConnection(context.locals);
  const userId = getUserId(context.locals);

  // Last-Event-ID header (sent automatically by EventSource on reconnect)
  const lastEventIdHeader = context.request.headers.get('Last-Event-ID');
  const parsed = lastEventIdHeader ? parseInt(lastEventIdHeader, 10) : 0;
  const lastEventId = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

  // Source ID from query param (to filter out own changes)
  const sourceId = context.url.searchParams.get('sourceId');

  // Query for new changes
  let conditions = and(eq(changeLog.clerk_user_id, userId), gt(changeLog.id, lastEventId));

  // Filter out changes from the requesting tab, but keep changes with NULL source_id
  // (e.g. from server-side operations or webhooks)
  if (sourceId) {
    conditions = and(
      conditions,
      sql`(${changeLog.source_id} IS NULL OR ${changeLog.source_id} != ${sourceId})`
    );
  }

  const changes = await db
    .select()
    .from(changeLog)
    .where(conditions)
    .orderBy(asc(changeLog.id))
    .limit(50)
    .all();

  // Build SSE response
  let body = 'retry: 3000\n\n';

  if (changes.length === 0) {
    body += ':heartbeat\n\n';
  } else {
    for (const change of changes) {
      const eventData = {
        entityType: change.entity_type,
        action: change.action,
        entityId: change.entity_id,
        parentId: change.parent_id,
        data: change.data ? JSON.parse(change.data) : null,
      };
      body += `id: ${change.id}\nevent: sync\ndata: ${JSON.stringify(eventData)}\n\n`;
    }
  }

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
};
