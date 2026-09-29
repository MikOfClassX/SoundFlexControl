export class LineFramer {
  #buffer = "";

  push(chunk) {
    this.#buffer += chunk.toString("utf8");
    const lines = [];
    let newlineIndex = this.#buffer.indexOf("\n");

    while (newlineIndex >= 0) {
      const rawLine = this.#buffer.slice(0, newlineIndex);
      lines.push(rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine);
      this.#buffer = this.#buffer.slice(newlineIndex + 1);
      newlineIndex = this.#buffer.indexOf("\n");
    }

    return lines;
  }

  reset() {
    this.#buffer = "";
  }
}
