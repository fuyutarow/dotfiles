const { execFile } = require("node:child_process");
const { FileView, Plugin } = require("obsidian");

const VIEW_TYPE = "doc-view";
const CONVERT_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 8 * 1024 * 1024;

const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
const FRAME_STYLE = `
  html { background: #fff; }
  body { max-width: 52rem; margin: 2rem auto; padding: 0 1rem;
    color: #000; background: #fff; font: 16px/1.65 system-ui, sans-serif; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #8888; padding: .35rem .6rem; }
`;

function withDocumentPolicy(html) {
  const csp = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
  const style = `<style>${FRAME_STYLE}</style>`;
  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html
      .replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${csp}`)
      .replace(/<\/head\s*>/i, `${style}</head>`);
  }
  return `<!doctype html><html><head>${csp}${style}</head><body>${html}</body></html>`;
}

module.exports = class DocViewPlugin extends Plugin {
  onload() {
    this.registerView(VIEW_TYPE, (leaf) => new DocFileView(leaf, this));
    this.registerExtensions(["doc"], VIEW_TYPE);
    this.app.workspace.onLayoutReady(() => this.claimDocExtension());
  }

  claimDocExtension() {
    try {
      // viewRegistry is private API; reclaim .doc after plugins have registered extensions.
      const registered = this.app.viewRegistry.getTypeByExtension("doc");
      if (registered !== VIEW_TYPE) {
        this.app.viewRegistry.unregisterExtensions(["doc"]);
        this.registerExtensions(["doc"], VIEW_TYPE);
      }

      this.app.workspace.iterateAllLeaves((leaf) => {
        const file = leaf.view?.file;
        if (file?.extension !== "doc" || leaf.view.getViewType() === VIEW_TYPE)
          return;
        void leaf.setViewState({
          type: VIEW_TYPE,
          state: { file: file.path },
          popstate: true,
        });
      });
    } catch (error) {
      console.error("DOC View could not claim .doc files", error);
    }
  }
};

module.exports.withDocumentPolicy = withDocumentPolicy;

class DocFileView extends FileView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.loadId = 0;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return this.file?.basename ?? "DOC";
  }

  async onLoadFile(file) {
    this.loadId += 1;
    const loadId = this.loadId;
    this.contentEl.replaceChildren();
    const absolutePath = this.app.vault.adapter.getFullPath(file.path);
    execFile(
      "/usr/bin/textutil",
      ["-convert", "html", "-stdout", absolutePath],
      { timeout: CONVERT_TIMEOUT_MS, maxBuffer: MAX_HTML_BYTES, encoding: "utf8" },
      (error, stdout) => {
        if (loadId !== this.loadId) return;
        if (error) {
          const message =
            error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
              ? "変換結果が大きすぎるため表示できません。"
              : error.killed
                ? "変換がタイムアウトしました。"
                : "この .doc ファイルを表示できませんでした。";
          this.showError(file, message);
          return;
        }
        if (Buffer.byteLength(stdout, "utf8") > MAX_HTML_BYTES) {
          this.showError(file, "変換結果が大きすぎるため表示できません。");
          return;
        }
        const frame = document.createElement("iframe");
        frame.setAttribute("sandbox", "");
        frame.setAttribute("title", `${file.basename} document`);
        frame.style.cssText = "width:100%;height:100%;min-height:70vh;border:0;background:var(--background-primary);";
        frame.srcdoc = withDocumentPolicy(stdout);
        this.contentEl.appendChild(frame);
      },
    );
  }

  showError(file, message) {
    const panel = this.contentEl.createDiv({ cls: "doc-view-error" });
    panel.createEl("p", { text: message });
    panel.createEl("p", { text: "元のファイルは変更していません。Word などの既定のアプリで開けます。" });
    const button = panel.createEl("button", { text: "既定のアプリで開く" });
    button.addEventListener("click", () => {
      void this.app.openWithDefaultApp(file.path);
    });
  }
};
