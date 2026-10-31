// The admission wait precedes all Linux-specific work; emulate its prerequisites on macOS.
Object.defineProperty(process, "platform", { value: "linux" });
Bun.which = () => "/fixture/tool";
