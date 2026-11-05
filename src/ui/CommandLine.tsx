export function CommandLine() {
  return (
    <section className="command-line" aria-label="Command line">
      <label className="command-prompt" htmlFor="command-input">
        <span aria-hidden="true">&gt;</span>
        <span className="visually-hidden">Command or measurement</span>
      </label>
      <input
        id="command-input"
        type="text"
        placeholder="Ready. No active command."
        disabled
        autoComplete="off"
        spellCheck={false}
      />
      <button className="command-button bevel" type="button" disabled>
        Enter
      </button>
      <button className="command-button bevel" type="button" disabled>
        Skip
      </button>
    </section>
  );
}
