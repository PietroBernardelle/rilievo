import { useEffect, useRef, useState } from 'react';
interface Props {
  projectName: string;
  canUndo: boolean;
  canRedo: boolean;
  canDelete: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onFit: () => void;
}
export function MenuBar(props: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  const menus = [
    {
      label: 'File',
      items: [
        { label: 'New', run: props.onNew },
        { label: 'Open…', run: props.onOpen },
        { label: 'Save JSON', run: props.onSave },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo · Ctrl+Z', run: props.onUndo, disabled: !props.canUndo },
        {
          label: 'Redo · Ctrl+Shift+Z',
          run: props.onRedo,
          disabled: !props.canRedo,
        },
        { label: 'Delete', run: props.onDelete, disabled: !props.canDelete },
      ],
    },
    { label: 'View', items: [{ label: 'Fit all · F', run: props.onFit }] },
  ];
  useEffect(() => {
    const close = (event: PointerEvent): void => {
      if (event.target instanceof Node && !nav.current?.contains(event.target))
        setOpen(null);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <header className="menu-bar">
      <nav ref={nav} className="menu-items" aria-label="Main menu">
        {menus.map((menu) => (
          <div className="menu-container" key={menu.label}>
            <button
              type="button"
              className="menu-button"
              aria-expanded={open === menu.label}
              onClick={() => setOpen(open === menu.label ? null : menu.label)}
            >
              {menu.label}
            </button>
            {open === menu.label && (
              <div
                className="menu-popup bevel"
                aria-label={`${menu.label} actions`}
              >
                {menu.items.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    disabled={'disabled' in item && item.disabled}
                    onClick={() => {
                      setOpen(null);
                      item.run();
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {['Survey', 'Export'].map((label) => (
          <button key={label} className="menu-button" type="button" disabled>
            {label}
          </button>
        ))}
        <details className="help-menu">
          <summary className="menu-button">Help</summary>
          <div className="menu-popup bevel">
            R rectangle · P polygon · V select
            <br />
            Enter closes polygon · Esc cancels
            <br />
            Space+drag or middle drag pans
            <br />
            Wheel zooms · F fits all
            <br />
            Shift disables snap
            <br />
            Delete removes · Ctrl+Z undoes
            <br />
            Ctrl+Shift+Z redoes
            <br />
            Properties: Enter or Tab applies
            <br />
            File New and Open are undoable
          </div>
        </details>
      </nav>
      <h1 title={props.projectName}>rilievo</h1>
    </header>
  );
}
