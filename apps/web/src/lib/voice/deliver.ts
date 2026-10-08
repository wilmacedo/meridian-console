// A message the owner recorded is worth another try when the network drops it on the way (a car between cells); a
// request they cut off is not. Only a failure to get an answer at all is retried: once the server has answered, the
// recording reached it, and the server drops a second copy of a message.
export async function deliver(url: string, init: RequestInit, attempts = 3, waitMs = 1000, doFetch: typeof fetch = fetch): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await doFetch(url, init)
    } catch (err) {
      if (init.signal?.aborted || attempt >= attempts) throw err
      await new Promise((resolve) => setTimeout(resolve, waitMs * attempt))
    }
  }
}
