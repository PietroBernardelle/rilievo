const MENU_ITEMS = ['File', 'Edit', 'View', 'Survey', 'Export', 'Help'];

export function MenuBar() {
  return (
    <header className="menu-bar">
      <nav className="menu-items" aria-label="Main menu">
        {MENU_ITEMS.map((label) => (
          <button
            key={label}
            className="menu-button"
            type="button"
            disabled
            title={`${label} — coming in a later milestone`}
          >
            {label}
          </button>
        ))}
      </nav>
      <h1>rilievo</h1>
    </header>
  );
}
