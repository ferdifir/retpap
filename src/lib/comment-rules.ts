/** Matches the CHECK constraint on comments.body. */
export const MAX_COMMENT_LENGTH = 500;

/** Trims and collapses the body before it is stored or counted. */
export function normaliseComment(body: string): string {
  return body.trim().replace(/\s+/g, " ");
}
