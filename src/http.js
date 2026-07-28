/**
 * Custom fetch wrapper that retries on transient errors (like 429 and 5xx).
 */
export async function fetchWithRetry(url, options = {}, retries = 3, backoff = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) {
        return res;
      }
      
      // Retry on Rate Limiting (429) or Server/Gateway errors (5xx)
      if (res.status !== 429 && res.status < 500) {
        return res; // Return non-transient errors (e.g. 400, 401, 403, 404) immediately
      }
      
      console.warn(`[http] Transient error ${res.status} on fetch. Retrying in ${backoff}ms...`);
    } catch (err) {
      if (i === retries - 1) {
        throw err; // Re-throw network error on final attempt
      }
      console.warn(`[http] Network error: ${err.message}. Retrying in ${backoff}ms...`);
    }
    
    await new Promise((resolve) => setTimeout(resolve, backoff));
    backoff *= 2; // Exponential backoff
  }
  
  return fetch(url, options); // Final attempt (passes failure or success through)
}
