declare var self: Worker;
self.addEventListener("message", () => {
  let entries = 0;
  const timer = setInterval(() => {
    entries++;
    self.postMessage({ kind: "progress", entries, bytes: entries }, []);
  }, 10);
  setTimeout(() => {
    clearInterval(timer);
    self.postMessage({ kind: "done", entries, bytes: 123 }, []);
  }, 350);
});
