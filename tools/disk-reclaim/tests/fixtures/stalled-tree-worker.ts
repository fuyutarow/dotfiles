declare var self: Worker;
self.addEventListener("message", () => {
  // Heartbeats with unchanged counters are not progress.
  setInterval(() => {
    self.postMessage({ kind: "progress", entries: 0, bytes: 0 }, []);
  }, 5);
});
