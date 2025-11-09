import { formatDuration, intervalToDuration, parseISO } from 'date-fns';

/**
 * Calculate elapsed time from start time to now
 */
export function calculateElapsed(startTime: string): string {
  const start = parseISO(startTime);
  const now = new Date();

  const duration = intervalToDuration({ start, end: now });

  const hours = duration.hours || 0;
  const minutes = duration.minutes || 0;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Calculate duration between start and end times
 * Returns minutes
 */
export function calculateDurationMinutes(startTime: string, endTime: string): number {
  const start = parseISO(startTime);
  const end = parseISO(endTime);

  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / 60000); // Convert to minutes
}

/**
 * Format minutes to GitLab time format (e.g., "2h30m", "45m", "1h")
 */
export function formatMinutesToGitLab(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0 && mins > 0) {
    return `${hours}h${mins}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

/**
 * Detect integration type from issue URL
 * Returns 'GitHub' or 'GitLab'
 */
export function detectIntegrationType(issueUrl: string): 'GitHub' | 'GitLab' {
  try {
    const url = new URL(issueUrl);
    if (url.host.includes('github.com')) {
      return 'GitHub';
    }
    return 'GitLab'; // Default to GitLab for all other hosts
  } catch {
    return 'GitLab';
  }
}

/**
 * Extract base URL from issue URL
 * e.g., "https://gitlab.openpolis.io/group/project/-/issues/123"
 *    -> "https://gitlab.openpolis.io"
 * e.g., "https://github.com/user/repo/issues/123"
 *    -> "https://github.com"
 */
export function extractBaseUrl(issueUrl: string): string {
  try {
    const url = new URL(issueUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'https://gitlab.com'; // Default fallback
  }
}

/**
 * Extract issue number from issue URL (works for both GitLab and GitHub)
 * e.g., "https://gitlab.../issues/123" -> "123"
 * e.g., "https://github.com/user/repo/issues/123" -> "123"
 */
export function extractIssueNumber(issueUrl: string): string | null {
  const match = issueUrl.match(/issues\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Format issue number for TMetric display
 */
export function formatIssueId(issueNumber: string, integrationType: 'GitHub' | 'GitLab'): string {
  return `${integrationType} Issue: #${issueNumber}`;
}
