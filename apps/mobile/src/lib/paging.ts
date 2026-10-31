/**
 * The next page for an endpoint that pages by number from 1 and reports
 * `total_pages`. Its query must sort to a total order, so pages do not overlap.
 */
export function nextNumberedPage(last: { total_pages: number }, pages: unknown[]): number | undefined {
  return pages.length < last.total_pages ? pages.length + 1 : undefined
}
